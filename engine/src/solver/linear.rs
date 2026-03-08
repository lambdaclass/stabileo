use crate::types::*;
use crate::linalg::*;
use crate::element;
use super::dof::DofNumbering;
use super::assembly::*;

/// Maps 12-DOF element indices to 14-DOF positions, skipping warping DOFs 6 and 13.
const DOF_MAP_12_TO_14: [usize; 12] = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];


/// Free DOFs threshold: use sparse solver when n_free >= this.
const SPARSE_THRESHOLD: usize = 64;

/// Solve a 2D linear static analysis.
pub fn solve_2d(input: &SolverInput) -> Result<AnalysisResults, String> {
    // Auto-delegate to constrained solver when constraints are present
    if !input.constraints.is_empty() {
        let ci = super::constraints::ConstrainedInput {
            solver: input.clone(),
            constraints: input.constraints.clone(),
        };
        return super::constraints::solve_constrained_2d(&ci);
    }

    let dof_num = DofNumbering::build_2d(input);

    if dof_num.n_free == 0 {
        return Err("No free DOFs — all nodes are fully restrained".into());
    }

    let asm = assemble_2d(input, &dof_num);
    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Build prescribed displacement vector u_r for restrained DOFs
    let nr = n - nf;
    let mut u_r = vec![0.0; nr];
    for sup in input.supports.values() {
        if sup.support_type == "spring" { continue; } // spring DOFs are free
        let prescribed: [(usize, Option<f64>); 3] = [
            (0, sup.dx), (1, sup.dy), (2, sup.drz),
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

    // Extract Kff and Ff, modify Ff for prescribed displacement coupling
    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();
    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let mut f_f = extract_subvec(&asm.f, &free_idx);

    // F_f_modified = F_f - K_fr * u_r
    let k_fr = extract_submatrix(&asm.k, n, &free_idx, &rest_idx);
    let k_fr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
    for i in 0..nf {
        f_f[i] -= k_fr_ur[i];
    }

    // Solve Kff * u_f = Ff_modified
    let u_f = if nf >= SPARSE_THRESHOLD {
        // Sparse path
        let k_ff_sparse = CscMatrix::from_dense_symmetric(&k_ff, nf);
        match sparse_cholesky_solve_full(&k_ff_sparse, &f_f) {
            Some(u) => u,
            None => {
                // Fallback to dense LU
                let mut k_work = k_ff;
                let mut f_work = f_f.clone();
                lu_solve(&mut k_work, &mut f_work, nf)
                    .ok_or_else(|| "Singular stiffness matrix — structure is a mechanism".to_string())?
            }
        }
    } else {
        let mut k_work = k_ff.clone();
        match cholesky_solve(&mut k_work, &f_f, nf) {
            Some(u) => u,
            None => {
                let mut k_work = k_ff;
                let mut f_work = f_f.clone();
                lu_solve(&mut k_work, &mut f_work, nf)
                    .ok_or_else(|| "Singular stiffness matrix — structure is a mechanism".to_string())?
            }
        }
    };

    // Build full displacement vector
    let mut u_full = vec![0.0; n];
    for i in 0..nf {
        u_full[i] = u_f[i];
    }
    for i in 0..nr {
        u_full[nf + i] = u_r[i];
    }

    // Check artificial DOFs for mechanism (absurd rotations)
    if !asm.artificial_dofs.is_empty() {
        for &idx in &asm.artificial_dofs {
            if idx < nf && u_f[idx].abs() > 100.0 {
                return Err(
                    "Local mechanism detected: a node with all elements hinged has \
                     excessive rotation, indicating local instability.".to_string()
                );
            }
        }
    }

    // Compute reactions: R = K_rf * u_f + K_rr * u_r - F_r
    let k_rf = extract_submatrix(&asm.k, n, &rest_idx, &free_idx);
    let k_rr = extract_submatrix(&asm.k, n, &rest_idx, &rest_idx);
    let f_r = extract_subvec(&asm.f, &rest_idx);
    let k_rf_uf = mat_vec_rect(&k_rf, &u_f, nr, nf);
    let k_rr_ur = mat_vec_rect(&k_rr, &u_r, nr, nr);
    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        reactions_vec[i] = k_rf_uf[i] + k_rr_ur[i] - f_r[i];
    }

    // Build results
    let displacements = build_displacements_2d(&dof_num, &u_full);
    let mut reactions = build_reactions_2d(input, &dof_num, &reactions_vec, &f_r, nf, &u_full);
    reactions.sort_by_key(|r| r.node_id);
    let mut element_forces = compute_internal_forces_2d(input, &dof_num, &u_full);
    element_forces.sort_by_key(|ef| ef.element_id);

    Ok(AnalysisResults {
        displacements,
        reactions,
        element_forces,
    })
}

/// Solve a 3D linear static analysis.
pub fn solve_3d(input: &SolverInput3D) -> Result<AnalysisResults3D, String> {
    // Auto-delegate to constrained solver when constraints are present
    if !input.constraints.is_empty() {
        let ci = super::constraints::ConstrainedInput3D {
            solver: input.clone(),
            constraints: input.constraints.clone(),
        };
        return super::constraints::solve_constrained_3d(&ci);
    }

    // Expand curved beams into frame elements before solving
    let input = expand_curved_beams_3d(input);
    let input = &input;
    let dof_num = DofNumbering::build_3d(input);

    if dof_num.n_free == 0 {
        return Err("No free DOFs — all nodes are fully restrained".into());
    }

    let asm = assemble_3d(input, &dof_num);
    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Build prescribed displacement vector u_r for restrained DOFs
    let nr = n - nf;
    let mut u_r = vec![0.0; nr];
    for sup in input.supports.values() {
        let prescribed = [sup.dx, sup.dy, sup.dz, sup.drx, sup.dry, sup.drz];
        for (i, pd) in prescribed.iter().enumerate() {
            if let Some(val) = pd {
                if val.abs() > 1e-15 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, i)) {
                        if d >= nf {
                            u_r[d - nf] = *val;
                        }
                    }
                }
            }
        }
    }

    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();
    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let mut f_f = extract_subvec(&asm.f, &free_idx);

    // F_f_modified = F_f - K_fr * u_r
    let k_fr = extract_submatrix(&asm.k, n, &free_idx, &rest_idx);
    let k_fr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
    for i in 0..nf {
        f_f[i] -= k_fr_ur[i];
    }

    let u_f = if nf >= SPARSE_THRESHOLD {
        let k_ff_sparse = CscMatrix::from_dense_symmetric(&k_ff, nf);
        match sparse_cholesky_solve_full(&k_ff_sparse, &f_f) {
            Some(u) => u,
            None => {
                let mut k_work = k_ff;
                let mut f_work = f_f.clone();
                lu_solve(&mut k_work, &mut f_work, nf)
                    .ok_or_else(|| "Singular stiffness matrix — structure is a mechanism".to_string())?
            }
        }
    } else {
        let mut k_work = k_ff.clone();
        match cholesky_solve(&mut k_work, &f_f, nf) {
            Some(u) => u,
            None => {
                let mut k_work = k_ff;
                let mut f_work = f_f.clone();
                lu_solve(&mut k_work, &mut f_work, nf)
                    .ok_or_else(|| "Singular stiffness matrix — structure is a mechanism".to_string())?
            }
        }
    };

    let mut u_full = vec![0.0; n];
    for i in 0..nf {
        u_full[i] = u_f[i];
    }
    for i in 0..nr {
        u_full[nf + i] = u_r[i];
    }

    // Compute reactions: R = K_rf * u_f + K_rr * u_r - F_r
    let k_rf = extract_submatrix(&asm.k, n, &rest_idx, &free_idx);
    let k_rr = extract_submatrix(&asm.k, n, &rest_idx, &rest_idx);
    let f_r = extract_subvec(&asm.f, &rest_idx);
    let k_rf_uf = mat_vec_rect(&k_rf, &u_f, nr, nf);
    let k_rr_ur = mat_vec_rect(&k_rr, &u_r, nr, nr);
    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        reactions_vec[i] = k_rf_uf[i] + k_rr_ur[i] - f_r[i];
    }

    // Reverse inclined support rotations on displacements
    for it in &asm.inclined_transforms {
        reverse_inclined_transform(&mut u_full, &it.dofs, &it.r);
    }

    let displacements = build_displacements_3d(&dof_num, &u_full);
    let mut reactions = build_reactions_3d_inclined(
        input, &dof_num, &reactions_vec, &f_r, nf, &u_full, &asm.inclined_transforms,
    );
    reactions.sort_by_key(|r| r.node_id);
    let mut element_forces = compute_internal_forces_3d(input, &dof_num, &u_full);
    element_forces.sort_by_key(|ef| ef.element_id);

    let plate_stresses = compute_plate_stresses(input, &dof_num, &u_full);
    let quad_stresses = compute_quad_stresses(input, &dof_num, &u_full);

    Ok(AnalysisResults3D {
        displacements,
        reactions,
        element_forces,
        plate_stresses,
        quad_stresses,
    })
}

pub(crate) fn build_displacements_2d(dof_num: &DofNumbering, u: &[f64]) -> Vec<Displacement> {
    dof_num.node_order.iter().map(|&node_id| {
        let ux = dof_num.global_dof(node_id, 0).map(|d| u[d]).unwrap_or(0.0);
        let uy = dof_num.global_dof(node_id, 1).map(|d| u[d]).unwrap_or(0.0);
        let rz = if dof_num.dofs_per_node >= 3 {
            dof_num.global_dof(node_id, 2).map(|d| u[d]).unwrap_or(0.0)
        } else {
            0.0
        };
        Displacement { node_id, ux, uy, rz }
    }).collect()
}

pub(crate) fn build_displacements_3d(dof_num: &DofNumbering, u: &[f64]) -> Vec<Displacement3D> {
    dof_num.node_order.iter().map(|&node_id| {
        let vals: Vec<f64> = (0..6).map(|i| {
            dof_num.global_dof(node_id, i).map(|d| u[d]).unwrap_or(0.0)
        }).collect();
        let warping = if dof_num.dofs_per_node >= 7 {
            dof_num.global_dof(node_id, 6).map(|d| u[d])
        } else {
            None
        };
        Displacement3D {
            node_id,
            ux: vals[0], uy: vals[1], uz: vals[2],
            rx: vals[3], ry: vals[4], rz: vals[5],
            warping,
        }
    }).collect()
}

pub(crate) fn build_reactions_2d(
    input: &SolverInput,
    dof_num: &DofNumbering,
    reactions_vec: &[f64],
    _f_r: &[f64],
    nf: usize,
    u_full: &[f64],
) -> Vec<Reaction> {
    let mut reactions = Vec::new();
    for sup in input.supports.values() {
        let mut rx = 0.0;
        let mut ry = 0.0;
        let mut mz = 0.0;

        if sup.support_type == "spring" {
            // Spring reaction: R = -k * u
            let ux = dof_num.global_dof(sup.node_id, 0).map(|d| u_full[d]).unwrap_or(0.0);
            let uy = dof_num.global_dof(sup.node_id, 1).map(|d| u_full[d]).unwrap_or(0.0);
            let rz_disp = if dof_num.dofs_per_node >= 3 {
                dof_num.global_dof(sup.node_id, 2).map(|d| u_full[d]).unwrap_or(0.0)
            } else { 0.0 };

            let kx = sup.kx.unwrap_or(0.0);
            let ky = sup.ky.unwrap_or(0.0);
            let kz = sup.kz.unwrap_or(0.0);

            if let Some(angle) = sup.angle {
                if angle.abs() > 1e-15 && (kx > 0.0 || ky > 0.0) {
                    let s = angle.sin();
                    let c = angle.cos();
                    let k_xx = kx * c * c + ky * s * s;
                    let k_yy = kx * s * s + ky * c * c;
                    let k_xy = (kx - ky) * s * c;
                    rx = -(k_xx * ux + k_xy * uy);
                    ry = -(k_xy * ux + k_yy * uy);
                } else {
                    rx = -kx * ux;
                    ry = -ky * uy;
                }
            } else {
                rx = -kx * ux;
                ry = -ky * uy;
            }
            mz = -kz * rz_disp;
        } else {
            // Rigid support: reaction from restrained partition
            if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
                if d >= nf {
                    let idx = d - nf;
                    rx = reactions_vec[idx];
                }
            }
            if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                if d >= nf {
                    let idx = d - nf;
                    ry = reactions_vec[idx];
                }
            }
            if dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 2)) {
                    if d >= nf {
                        let idx = d - nf;
                        mz = reactions_vec[idx];
                    }
                }
            }
        }

        reactions.push(Reaction {
            node_id: sup.node_id,
            rx, ry, mz,
        });
    }
    reactions
}

pub(crate) fn build_reactions_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    reactions_vec: &[f64],
    _f_r: &[f64],
    nf: usize,
    u_full: &[f64],
) -> Vec<Reaction3D> {
    let mut reactions = Vec::new();
    for sup in input.supports.values() {
        let mut vals = [0.0f64; 6];

        // Check if this is a spring support (all DOFs free with spring stiffness)
        let spring_stiffs = [sup.kx, sup.ky, sup.kz, sup.krx, sup.kry, sup.krz];
        let is_spring = spring_stiffs.iter().any(|k| k.map_or(false, |v| v > 0.0))
            && !(0..6.min(dof_num.dofs_per_node)).any(|i| {
                let restrained = match i {
                    0 => sup.rx, 1 => sup.ry, 2 => sup.rz,
                    3 => sup.rrx, 4 => sup.rry, 5 => sup.rrz,
                    _ => false,
                };
                restrained
            });

        if is_spring {
            // Spring reaction: R = -k * u
            for i in 0..6.min(dof_num.dofs_per_node) {
                let u = dof_num.global_dof(sup.node_id, i).map(|d| u_full[d]).unwrap_or(0.0);
                let k = spring_stiffs[i].unwrap_or(0.0);
                vals[i] = -k * u;
            }
        } else {
            for i in 0..6.min(dof_num.dofs_per_node) {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, i)) {
                    if d >= nf {
                        let idx = d - nf;
                        vals[i] = reactions_vec[idx];
                    }
                }
            }
        }

        // Bimoment reaction at warping DOF 6
        let bimoment = if dof_num.dofs_per_node >= 7 {
            if let Some(&d) = dof_num.map.get(&(sup.node_id, 6)) {
                if d >= nf {
                    Some(reactions_vec[d - nf])
                } else if is_spring {
                    let u = dof_num.global_dof(sup.node_id, 6).map(|d| u_full[d]).unwrap_or(0.0);
                    let kw = sup.kw.unwrap_or(0.0);
                    Some(-kw * u)
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        reactions.push(Reaction3D {
            node_id: sup.node_id,
            fx: vals[0], fy: vals[1], fz: vals[2],
            mx: vals[3], my: vals[4], mz: vals[5],
            bimoment,
        });
    }
    reactions
}

/// Build 3D reactions with inclined support back-transformation.
fn build_reactions_3d_inclined(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    reactions_vec: &[f64],
    f_r: &[f64],
    nf: usize,
    u_full: &[f64],
    inclined_transforms: &[InclinedTransformData],
) -> Vec<Reaction3D> {
    let mut reactions = build_reactions_3d(input, dof_num, reactions_vec, f_r, nf, u_full);

    // Back-transform inclined support reactions from rotated to global frame
    for it in inclined_transforms {
        if let Some(r) = reactions.iter_mut().find(|r| r.node_id == it.node_id) {
            let rotated = [r.fx, r.fy, r.fz];
            // r_global = R^T * r_rotated
            r.fx = it.r[0][0] * rotated[0] + it.r[1][0] * rotated[1] + it.r[2][0] * rotated[2];
            r.fy = it.r[0][1] * rotated[0] + it.r[1][1] * rotated[1] + it.r[2][1] * rotated[2];
            r.fz = it.r[0][2] * rotated[0] + it.r[1][2] * rotated[1] + it.r[2][2] * rotated[2];
        }
    }

    reactions
}

pub(crate) fn compute_internal_forces_2d(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u: &[f64],
) -> Vec<ElementForces> {
    let mut forces = Vec::new();

    for elem in input.elements.values() {
        let node_i = input.nodes.values().find(|n| n.id == elem.node_i).unwrap();
        let node_j = input.nodes.values().find(|n| n.id == elem.node_j).unwrap();
        let mat = input.materials.values().find(|m| m.id == elem.material_id).unwrap();
        let sec = input.sections.values().find(|s| s.id == elem.section_id).unwrap();

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;
        let e = mat.e * 1000.0;

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            // Truss: compute axial force from deformation
            let ui = [
                dof_num.global_dof(elem.node_i, 0).map(|d| u[d]).unwrap_or(0.0),
                dof_num.global_dof(elem.node_i, 1).map(|d| u[d]).unwrap_or(0.0),
            ];
            let uj = [
                dof_num.global_dof(elem.node_j, 0).map(|d| u[d]).unwrap_or(0.0),
                dof_num.global_dof(elem.node_j, 1).map(|d| u[d]).unwrap_or(0.0),
            ];
            let delta = (uj[0] - ui[0]) * cos + (uj[1] - ui[1]) * sin;
            let n_axial = e * sec.a / l * delta;

            forces.push(ElementForces {
                element_id: elem.id,
                n_start: n_axial,
                n_end: n_axial,
                v_start: 0.0,
                v_end: 0.0,
                m_start: 0.0,
                m_end: 0.0,
                length: l,
                q_i: 0.0,
                q_j: 0.0,
                point_loads: Vec::new(),
                distributed_loads: Vec::new(),
                hinge_start: false,
                hinge_end: false,
            });
        } else {
            // Frame: transform displacements to local, compute k*u - FEF
            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            let u_global: Vec<f64> = elem_dofs.iter().map(|&d| u[d]).collect();

            let t = crate::element::frame_transform_2d(cos, sin);
            let u_local = transform_displacement(&u_global, &t, 6);

            let phi = if let Some(as_y) = sec.as_y {
                let g = e / (2.0 * (1.0 + mat.nu));
                12.0 * e * sec.iz / (g * as_y * l * l)
            } else {
                0.0
            };
            let k_local = crate::element::frame_local_stiffness_2d(
                e, sec.a, sec.iz, l, elem.hinge_start, elem.hinge_end, phi,
            );

            // f_local = K_local * u_local
            let mut f_local = vec![0.0; 6];
            for i in 0..6 {
                for j in 0..6 {
                    f_local[i] += k_local[i * 6 + j] * u_local[j];
                }
            }

            // Subtract fixed-end forces from element loads (f = K*u - FEF)
            let (mut total_qi, mut total_qj) = (0.0, 0.0);
            let mut point_loads_info = Vec::new();
            let mut dist_loads_info = Vec::new();

            for load in &input.loads {
                match load {
                    SolverLoad::Distributed(dl) if dl.element_id == elem.id => {
                        let a = dl.a.unwrap_or(0.0);
                        let b = dl.b.unwrap_or(l);
                        let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);

                        let mut fef = if is_full {
                            crate::element::fef_distributed_2d(dl.q_i, dl.q_j, l)
                        } else {
                            crate::element::fef_partial_distributed_2d(dl.q_i, dl.q_j, a, b, l)
                        };

                        crate::element::adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end);

                        for i in 0..6 {
                            f_local[i] -= fef[i];
                        }

                        if is_full {
                            total_qi += dl.q_i;
                            total_qj += dl.q_j;
                        }
                        dist_loads_info.push(DistributedLoadInfo {
                            q_i: dl.q_i,
                            q_j: dl.q_j,
                            a,
                            b,
                        });
                    }
                    SolverLoad::PointOnElement(pl) if pl.element_id == elem.id => {
                        let px = pl.px.unwrap_or(0.0);
                        let mz = pl.mz.unwrap_or(0.0);
                        let mut fef = crate::element::fef_point_load_2d(pl.p, px, mz, pl.a, l);
                        crate::element::adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end);
                        for i in 0..6 {
                            f_local[i] -= fef[i];
                        }
                        point_loads_info.push(PointLoadInfo {
                            a: pl.a,
                            p: pl.p,
                            px: pl.px,
                            mz: pl.mz,
                        });
                    }
                    SolverLoad::Thermal(tl) if tl.element_id == elem.id => {
                        let alpha = 12e-6;
                        let h = if sec.a > 1e-15 { (12.0 * sec.iz / sec.a).sqrt() } else { 0.1 };
                        let mut fef = crate::element::fef_thermal_2d(
                            e, sec.a, sec.iz, l,
                            tl.dt_uniform, tl.dt_gradient, alpha, h,
                        );
                        crate::element::adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end);
                        for i in 0..6 {
                            f_local[i] -= fef[i];
                        }
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
                length: l,
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

pub(crate) fn compute_internal_forces_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
) -> Vec<ElementForces3D> {
    let mut forces = Vec::new();
    let left_hand = input.left_hand.unwrap_or(false);

    for elem in input.elements.values() {
        let node_i = input.nodes.values().find(|n| n.id == elem.node_i).unwrap();
        let node_j = input.nodes.values().find(|n| n.id == elem.node_j).unwrap();
        let mat = input.materials.values().find(|m| m.id == elem.material_id).unwrap();
        let sec = input.sections.values().find(|s| s.id == elem.section_id).unwrap();

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let dz = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();
        let e = mat.e * 1000.0;
        let g = e / (2.0 * (1.0 + mat.nu));

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let dir = [dx / l, dy / l, dz / l];
            let ui: Vec<f64> = (0..3).map(|i| {
                dof_num.global_dof(elem.node_i, i).map(|d| u[d]).unwrap_or(0.0)
            }).collect();
            let uj: Vec<f64> = (0..3).map(|i| {
                dof_num.global_dof(elem.node_j, i).map(|d| u[d]).unwrap_or(0.0)
            }).collect();
            let delta: f64 = (0..3).map(|i| (uj[i] - ui[i]) * dir[i]).sum();
            let n_axial = e * sec.a / l * delta;

            forces.push(ElementForces3D {
                element_id: elem.id, length: l,
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
                distributed_loads_z: Vec::new(), point_loads_z: Vec::new(), bimoment_start: None, bimoment_end: None });
            continue;
        }

        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
        let has_cw = sec.cw.map_or(false, |cw| cw > 0.0);

        let (ex, ey, ez) = element::compute_local_axes_3d(
            node_i.x, node_i.y, node_i.z,
            node_j.x, node_j.y, node_j.z,
            elem.local_yx, elem.local_yy, elem.local_yz,
            elem.roll_angle,
            left_hand,
        );

        // Compute Timoshenko shear parameters for each bending plane
        let (phi_y, phi_z) = if sec.as_y.is_some() || sec.as_z.is_some() {
            let l2 = l * l;
            let py = sec.as_y.map(|ay| 12.0 * e * sec.iy / (g * ay * l2)).unwrap_or(0.0);
            let pz = sec.as_z.map(|az| 12.0 * e * sec.iz / (g * az * l2)).unwrap_or(0.0);
            (py, pz)
        } else {
            (0.0, 0.0)
        };

        // Determine element size and compute f_local
        let (f_local, ndof_elem) = if has_cw && dof_num.dofs_per_node >= 7 {
            // Warping element: 14×14
            let u_global: Vec<f64> = elem_dofs.iter().map(|&d| u[d]).collect();
            let t = element::frame_transform_3d_warping(&ex, &ey, &ez);
            let u_local = transform_displacement(&u_global, &t, 14);
            let k_local = element::frame_local_stiffness_3d_warping(
                e, sec.a, sec.iy, sec.iz, sec.j, sec.cw.unwrap(), l, g,
                elem.hinge_start, elem.hinge_end, phi_y, phi_z,
            );
            let mut fl = vec![0.0; 14];
            for i in 0..14 {
                for j in 0..14 {
                    fl[i] += k_local[i * 14 + j] * u_local[j];
                }
            }
            (fl, 14)
        } else if dof_num.dofs_per_node >= 7 {
            // Non-warping element in warping model: extract 12 DOFs via map
            let u12: Vec<f64> = DOF_MAP_12_TO_14.iter().map(|&idx| {
                let d = elem_dofs[idx];
                u[d]
            }).collect();
            let t = element::frame_transform_3d(&ex, &ey, &ez);
            let u_local = transform_displacement(&u12, &t, 12);
            let k_local = element::frame_local_stiffness_3d(
                e, sec.a, sec.iy, sec.iz, sec.j, l, g,
                elem.hinge_start, elem.hinge_end, phi_y, phi_z,
            );
            let mut fl = vec![0.0; 12];
            for i in 0..12 {
                for j in 0..12 {
                    fl[i] += k_local[i * 12 + j] * u_local[j];
                }
            }
            (fl, 12)
        } else {
            // Standard 12-DOF
            let u_global: Vec<f64> = elem_dofs.iter().map(|&d| u[d]).collect();
            let t = element::frame_transform_3d(&ex, &ey, &ez);
            let u_local = transform_displacement(&u_global, &t, 12);
            let k_local = element::frame_local_stiffness_3d(
                e, sec.a, sec.iy, sec.iz, sec.j, l, g,
                elem.hinge_start, elem.hinge_end, phi_y, phi_z,
            );
            let mut fl = vec![0.0; 12];
            for i in 0..12 {
                for j in 0..12 {
                    fl[i] += k_local[i * 12 + j] * u_local[j];
                }
            }
            (fl, 12)
        };

        let mut f_local = f_local;

        // Map indices for force extraction (warping uses different layout)
        // 14-DOF: [u1,v1,w1,θx1,θy1,θz1,φ'1, u2,v2,w2,θx2,θy2,θz2,φ'2]
        // 12-DOF: [u1,v1,w1,θx1,θy1,θz1, u2,v2,w2,θx2,θy2,θz2]
        let (i_n, i_vy, i_vz, i_mx, i_my, i_mz) = if ndof_elem == 14 {
            (0, 1, 2, 3, 4, 5)
        } else {
            (0, 1, 2, 3, 4, 5)
        };
        let (j_n, j_vy, j_vz, j_mx, j_my, j_mz) = if ndof_elem == 14 {
            (7, 8, 9, 10, 11, 12)
        } else {
            (6, 7, 8, 9, 10, 11)
        };

        // Subtract FEF from element loads (f = K*u - FEF)
        let (mut q_yi_total, mut q_yj_total) = (0.0, 0.0);
        let (mut q_zi_total, mut q_zj_total) = (0.0, 0.0);
        let mut dist_loads_y = Vec::new();
        let mut dist_loads_z = Vec::new();
        let mut pt_loads_y = Vec::new();
        let mut pt_loads_z = Vec::new();

        for load in &input.loads {
            match load {
                SolverLoad3D::Distributed(dl) if dl.element_id == elem.id => {
                    let a_param = dl.a.unwrap_or(0.0);
                    let b_param = dl.b.unwrap_or(l);
                    let is_full_fef = (a_param.abs() < 1e-12) && ((b_param - l).abs() < 1e-12);
                    let fef12 = if is_full_fef {
                        element::fef_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, l)
                    } else {
                        element::fef_partial_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, a_param, b_param, l)
                    };
                    if ndof_elem == 14 {
                        let fef14 = element::expand_fef_12_to_14(&fef12);
                        for i in 0..14 {
                            f_local[i] -= fef14[i];
                        }
                    } else {
                        for i in 0..12 {
                            f_local[i] -= fef12[i];
                        }
                    }
                    let a = dl.a.unwrap_or(0.0);
                    let b = dl.b.unwrap_or(l);
                    let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);
                    if is_full {
                        q_yi_total += dl.q_yi;
                        q_yj_total += dl.q_yj;
                        q_zi_total += dl.q_zi;
                        q_zj_total += dl.q_zj;
                    }
                    dist_loads_y.push(DistributedLoadInfo { q_i: dl.q_yi, q_j: dl.q_yj, a, b });
                    dist_loads_z.push(DistributedLoadInfo { q_i: dl.q_zi, q_j: dl.q_zj, a, b });
                }
                SolverLoad3D::PointOnElement(pl) if pl.element_id == elem.id => {
                    let fef_y = element::fef_point_load_2d(pl.py, 0.0, 0.0, pl.a, l);
                    if ndof_elem == 14 {
                        let mut fef12 = [0.0; 12];
                        fef12[1] = fef_y[1]; fef12[5] = fef_y[2];
                        fef12[7] = fef_y[4]; fef12[11] = fef_y[5];
                        let fef_z = element::fef_point_load_2d(pl.pz, 0.0, 0.0, pl.a, l);
                        fef12[2] = fef_z[1]; fef12[4] = -fef_z[2];
                        fef12[8] = fef_z[4]; fef12[10] = -fef_z[5];
                        let fef14 = element::expand_fef_12_to_14(&fef12);
                        for i in 0..14 { f_local[i] -= fef14[i]; }
                    } else {
                        f_local[1] -= fef_y[1];
                        f_local[5] -= fef_y[2];
                        f_local[7] -= fef_y[4];
                        f_local[11] -= fef_y[5];
                        let fef_z = element::fef_point_load_2d(pl.pz, 0.0, 0.0, pl.a, l);
                        f_local[2] -= fef_z[1];
                        f_local[4] += fef_z[2];
                        f_local[8] -= fef_z[4];
                        f_local[10] += fef_z[5];
                    }

                    pt_loads_y.push(PointLoadInfo3D { a: pl.a, p: pl.py });
                    pt_loads_z.push(PointLoadInfo3D { a: pl.a, p: pl.pz });
                }
                SolverLoad3D::Thermal(tl) if tl.element_id == elem.id => {
                    let alpha = 12e-6;
                    let hy = if sec.a > 1e-15 { (12.0 * sec.iz / sec.a).sqrt() } else { 0.1 };
                    let hz = if sec.a > 1e-15 { (12.0 * sec.iy / sec.a).sqrt() } else { 0.1 };
                    let fef12 = element::fef_thermal_3d(
                        e, sec.a, sec.iy, sec.iz, l,
                        tl.dt_uniform, tl.dt_gradient_y, tl.dt_gradient_z,
                        alpha, hy, hz,
                    );
                    if ndof_elem == 14 {
                        let fef14 = element::expand_fef_12_to_14(&fef12);
                        for i in 0..14 {
                            f_local[i] -= fef14[i];
                        }
                    } else {
                        for i in 0..12 {
                            f_local[i] -= fef12[i];
                        }
                    }
                }
                _ => {}
            }
        }

        let bimoment_start = if ndof_elem == 14 { Some(-f_local[6]) } else { None };
        let bimoment_end = if ndof_elem == 14 { Some(f_local[13]) } else { None };

        forces.push(ElementForces3D {
            element_id: elem.id,
            length: l,
            n_start: -f_local[i_n],
            n_end: f_local[j_n],
            vy_start: f_local[i_vy],
            vy_end: -f_local[j_vy],
            vz_start: f_local[i_vz],
            vz_end: -f_local[j_vz],
            mx_start: f_local[i_mx],
            mx_end: -f_local[j_mx],
            my_start: f_local[i_my],
            my_end: -f_local[j_my],
            mz_start: f_local[i_mz],
            mz_end: -f_local[j_mz],
            hinge_start: elem.hinge_start,
            hinge_end: elem.hinge_end,
            q_yi: q_yi_total,
            q_yj: q_yj_total,
            distributed_loads_y: dist_loads_y,
            point_loads_y: pt_loads_y,
            q_zi: q_zi_total,
            q_zj: q_zj_total,
            distributed_loads_z: dist_loads_z,
            point_loads_z: pt_loads_z,
            bimoment_start,
            bimoment_end,
        });
    }

    forces
}

/// Expand curved beams into frame elements before solving.
/// Clones input, adds intermediate nodes and frame elements.
fn expand_curved_beams_3d(input: &SolverInput3D) -> SolverInput3D {
    if input.curved_beams.is_empty() {
        return input.clone();
    }

    let mut result = input.clone();

    // Find next available node and element IDs
    let mut next_node_id = result.nodes.values().map(|n| n.id).max().unwrap_or(0) + 1;
    let mut next_elem_id = result.elements.values().map(|e| e.id).max().unwrap_or(0) + 1;

    for cb in &input.curved_beams {
        let n_start = result.nodes.values().find(|n| n.id == cb.node_start).unwrap().clone();
        let n_mid = result.nodes.values().find(|n| n.id == cb.node_mid).unwrap().clone();
        let n_end = result.nodes.values().find(|n| n.id == cb.node_end).unwrap().clone();

        let expansion = crate::element::expand_curved_beam(
            cb,
            [n_start.x, n_start.y, n_start.z],
            [n_mid.x, n_mid.y, n_mid.z],
            [n_end.x, n_end.y, n_end.z],
            next_node_id,
            next_elem_id,
        );

        // Snap the mid-arc node into the element chain: find the intermediate node
        // closest to node_mid and replace its ID with node_mid's ID. This ensures
        // loads/supports on node_mid work correctly after expansion.
        let mid_id = cb.node_mid;
        let mid_pos = [n_mid.x, n_mid.y, n_mid.z];
        let mut snap_from: Option<usize> = None;
        let mut snap_dist = f64::MAX;
        // Only snap if mid-node is not already a start/end node
        if mid_id != cb.node_start && mid_id != cb.node_end {
            for &(nid, x, y, z) in &expansion.new_nodes {
                let d = ((x - mid_pos[0]).powi(2) + (y - mid_pos[1]).powi(2) + (z - mid_pos[2]).powi(2)).sqrt();
                if d < snap_dist {
                    snap_dist = d;
                    snap_from = Some(nid);
                }
            }
        }

        // Add intermediate nodes (replacing the snapped node's ID with mid_id)
        for &(nid, x, y, z) in &expansion.new_nodes {
            let actual_id = if snap_from == Some(nid) { mid_id } else { nid };
            if actual_id != mid_id {
                // Don't re-insert mid_id since it's already in the map
                result.nodes.insert(actual_id.to_string(), SolverNode3D { id: actual_id, x, y, z });
            }
            if nid >= next_node_id {
                next_node_id = nid + 1;
            }
        }

        // Add frame elements (remapping snapped node ID)
        for &(eid, ni, nj, mat_id, sec_id, hs, he) in &expansion.new_elements {
            let actual_ni = if snap_from == Some(ni) { mid_id } else { ni };
            let actual_nj = if snap_from == Some(nj) { mid_id } else { nj };
            result.elements.insert(eid.to_string(), SolverElement3D {
                id: eid,
                elem_type: "frame".to_string(),
                node_i: actual_ni,
                node_j: actual_nj,
                material_id: mat_id,
                section_id: sec_id,
                hinge_start: hs,
                hinge_end: he,
                local_yx: None,
                local_yy: None,
                local_yz: None,
                roll_angle: None,
            });
            if eid >= next_elem_id {
                next_elem_id = eid + 1;
            }
        }
    }

    result
}

/// Compute plate stresses for all plate elements.
pub(crate) fn compute_plate_stresses(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
) -> Vec<PlateStress> {
    let mut stresses = Vec::new();

    for plate in input.plates.values() {
        let mat = input.materials.values().find(|m| m.id == plate.material_id).unwrap();
        let e = mat.e * 1000.0;
        let nu = mat.nu;

        let n0 = input.nodes.values().find(|nd| nd.id == plate.nodes[0]).unwrap();
        let n1 = input.nodes.values().find(|nd| nd.id == plate.nodes[1]).unwrap();
        let n2 = input.nodes.values().find(|nd| nd.id == plate.nodes[2]).unwrap();
        let coords = [
            [n0.x, n0.y, n0.z],
            [n1.x, n1.y, n1.z],
            [n2.x, n2.y, n2.z],
        ];

        // Get global displacements for plate nodes
        let plate_dofs = dof_num.plate_element_dofs(&plate.nodes);
        let u_global: Vec<f64> = plate_dofs.iter().map(|&d| u[d]).collect();

        // Transform to local
        let t_plate = crate::element::plate_transform_3d(&coords);
        let u_local = crate::linalg::transform_displacement(&u_global, &t_plate, 18);

        // Recover stresses at centroid
        let s = crate::element::plate_stress_recovery(&coords, e, nu, plate.thickness, &u_local);

        // Also recover nodal stresses for stress smoothing
        let nodal = crate::element::plate_stress_at_nodes(&coords, e, nu, plate.thickness, &u_local);
        let nodal_vm: Vec<f64> = nodal.iter().map(|ns| ns.von_mises).collect();

        stresses.push(PlateStress {
            element_id: plate.id,
            sigma_xx: s.sigma_xx,
            sigma_yy: s.sigma_yy,
            tau_xy: s.tau_xy,
            mx: s.mx,
            my: s.my,
            mxy: s.mxy,
            sigma_1: s.sigma_1,
            sigma_2: s.sigma_2,
            von_mises: s.von_mises,
            nodal_von_mises: nodal_vm,
        });
    }

    stresses
}

pub(crate) fn compute_quad_stresses(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
) -> Vec<QuadStress> {
    let mut stresses = Vec::new();

    for quad in input.quads.values() {
        let mat = input.materials.values().find(|m| m.id == quad.material_id).unwrap();
        let e = mat.e * 1000.0;
        let nu = mat.nu;

        let n0 = input.nodes.values().find(|nd| nd.id == quad.nodes[0]).unwrap();
        let n1 = input.nodes.values().find(|nd| nd.id == quad.nodes[1]).unwrap();
        let n2 = input.nodes.values().find(|nd| nd.id == quad.nodes[2]).unwrap();
        let n3 = input.nodes.values().find(|nd| nd.id == quad.nodes[3]).unwrap();
        let coords = [
            [n0.x, n0.y, n0.z],
            [n1.x, n1.y, n1.z],
            [n2.x, n2.y, n2.z],
            [n3.x, n3.y, n3.z],
        ];

        let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
        let u_global: Vec<f64> = quad_dofs.iter().map(|&d| u[d]).collect();

        let t_quad = crate::element::quad::quad_transform_3d(&coords);
        let u_local_vec = crate::linalg::transform_displacement(&u_global, &t_quad, 24);
        let mut u_local = [0.0; 24];
        u_local.copy_from_slice(&u_local_vec);

        let s = crate::element::quad::quad_stresses(&coords, &u_local, e, nu, quad.thickness);

        // Nodal stresses at 4 Gauss-extrapolated points
        let nodal_vm = crate::element::quad::quad_nodal_von_mises(&coords, &u_local, e, nu, quad.thickness);

        stresses.push(QuadStress {
            element_id: quad.id,
            sigma_xx: s.sigma_xx,
            sigma_yy: s.sigma_yy,
            tau_xy: s.tau_xy,
            mx: s.mx,
            my: s.my,
            mxy: s.mxy,
            von_mises: s.von_mises,
            nodal_von_mises: nodal_vm,
        });
    }

    stresses
}
