/// Nonlinear cable analysis solver.
///
/// Handles mixed cable-frame structures with:
/// - Ernst equivalent modulus for cable elements
/// - Tension-only behavior (zero stiffness in compression)
/// - Iterative modified stiffness with sag-dependent updates
///
/// Cable elements are identified by elem_type == "cable". They use the
/// same node/material/section definitions as trusses but with modified
/// stiffness formulation.
///
/// References:
///   - Irvine, "Cable Structures" (1981)
///   - Ernst, "Der E-Modul von Seilen" (1965)
///   - Buchholdt, "An Introduction to Cable Roof Structures" (1999)
use std::collections::HashMap;
use crate::types::*;
use crate::element;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly;
use super::linear;
use super::constraints::FreeConstraintSystem;

/// Result of a cable analysis.
#[derive(Debug, Clone)]
pub struct CableAnalysisResult2D {
    pub results: AnalysisResults,
    pub iterations: usize,
    pub converged: bool,
    pub cable_forces: Vec<CableElementResult>,
}

/// Result of a 3D cable analysis.
#[derive(Debug, Clone)]
pub struct CableAnalysisResult3D {
    pub results: AnalysisResults3D,
    pub iterations: usize,
    pub converged: bool,
    pub cable_forces: Vec<CableElementResult>,
}

/// Per-cable-element results.
#[derive(Debug, Clone)]
pub struct CableElementResult {
    pub element_id: usize,
    pub tension: f64,
    pub horizontal_thrust: f64,
    pub sag: f64,
    pub ernst_modulus: f64,
    pub unstretched_length: f64,
}

/// Precomputed cable element geometry.
struct CableGeom {
    elem_id: usize,
    node_i_id: usize,
    node_j_id: usize,
    l0: f64,
    dx: f64,
    dy: f64,
    cos_a: f64,
    sin_a: f64,
    ea: f64,
    w: f64, // self-weight per unit length (kN/m)
}

/// 3D cable element geometry.
struct CableGeom3D {
    elem_id: usize,
    node_i_id: usize,
    node_j_id: usize,
    l0: f64,
    dx: f64,
    dy: f64,
    dz: f64,
    dir: [f64; 3],
    ea: f64,
    w: f64,
}

/// Solve K*u = F with Cholesky fallback to LU.
fn solve_system(k_ff: &[f64], f_f: &[f64], nf: usize) -> Result<Vec<f64>, String> {
    let mut k_work = k_ff.to_vec();
    match cholesky_solve(&mut k_work, f_f, nf) {
        Some(u) => Ok(u),
        None => {
            let mut k_work = k_ff.to_vec();
            let mut f_work = f_f.to_vec();
            lu_solve(&mut k_work, &mut f_work, nf)
                .ok_or_else(|| "Singular stiffness matrix — structure is a mechanism".to_string())
        }
    }
}

/// Solve a 2D structure containing cable elements.
///
/// Uses an iterative procedure:
/// 1. Assemble using standard assembly (cables treated as trusses)
/// 2. Modify cable stiffness entries using Ernst equivalent modulus
/// 3. Solve and extract cable tensions
/// 4. Repeat until cable tensions converge
///
/// `densities`: optional material densities (material_id string → kg/m³).
/// When provided, enables Ernst equivalent modulus correction for cable sag.
pub fn solve_cable_2d(
    input: &SolverInput,
    densities: &HashMap<String, f64>,
    max_iter: usize,
    tolerance: f64,
) -> Result<CableAnalysisResult2D, String> {
    let dof_num = DofNumbering::build_2d(input);

    if dof_num.n_free == 0 {
        return Err("No free DOFs — all nodes are fully restrained".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_2d(&input.constraints, &dof_num, &input.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Identify cable elements
    let has_cables = input.elements.values().any(|e| e.elem_type == "cable");

    if !has_cables {
        let results = linear::solve_2d(input)?;
        return Ok(CableAnalysisResult2D {
            results,
            iterations: 1,
            converged: true,
            cable_forces: Vec::new(),
        });
    }

    // Build O(1) lookup maps by id
    let node_by_id: HashMap<usize, &SolverNode> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection> =
        input.sections.values().map(|s| (s.id, s)).collect();

    // Precompute cable geometry
    let mut cables: Vec<CableGeom> = Vec::new();
    let mut cable_tensions: HashMap<usize, f64> = HashMap::new();

    for elem in input.elements.values() {
        if elem.elem_type != "cable" {
            continue;
        }
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let l0 = (dx * dx + dy * dy).sqrt();
        let e = mat.e * 1000.0;

        let density = densities.get(&elem.material_id.to_string())
            .copied().unwrap_or(0.0) / 1000.0; // kg/m³ → t/m³
        let w = element::cable_self_weight(density, sec.a);

        cables.push(CableGeom {
            elem_id: elem.id,
            node_i_id: elem.node_i,
            node_j_id: elem.node_j,
            l0, dx, dy,
            cos_a: dx / l0,
            sin_a: dy / l0,
            ea: e * sec.a,
            w,
        });
        cable_tensions.insert(elem.id, 0.0);
    }

    // Base assembly (treats cables as trusses with full E)
    let base_asm = assembly::assemble_2d(input, &dof_num);
    let f_global = base_asm.f.clone();

    let mut u_full = vec![0.0; n];
    let mut converged = false;
    let mut total_iterations = 0;

    for iter in 0..max_iter {
        total_iterations = iter + 1;

        let mut k_global = base_asm.k.clone();

        // Modify cable stiffnesses based on current tension
        for ci in &cables {
            let tension = cable_tensions[&ci.elem_id];

            let cable_dofs = [
                dof_num.global_dof(ci.node_i_id, 0).unwrap(),
                dof_num.global_dof(ci.node_i_id, 1).unwrap(),
                dof_num.global_dof(ci.node_j_id, 0).unwrap(),
                dof_num.global_dof(ci.node_j_id, 1).unwrap(),
            ];

            // Ernst equivalent modulus factor
            let l_h = ci.dx.abs().max(1e-10);
            let e_eq_factor = if tension > 1e-10 && ci.w > 1e-15 {
                let wl = ci.w * l_h;
                1.0 / (1.0 + wl * wl * ci.ea / (12.0 * tension.powi(3)))
            } else if tension <= 0.0 && iter > 0 {
                0.0 // Slack cable: remove stiffness
            } else {
                1.0
            };

            if (e_eq_factor - 1.0).abs() > 1e-15 {
                let ea_l = ci.ea / ci.l0;
                let diff = (e_eq_factor - 1.0) * ea_l;
                let c2 = ci.cos_a * ci.cos_a;
                let s2 = ci.sin_a * ci.sin_a;
                let cs = ci.cos_a * ci.sin_a;

                // Correction matrix: adds (E_eq - E) * A/L contribution
                let dk = [
                    [diff * c2,  diff * cs, -diff * c2, -diff * cs],
                    [diff * cs,  diff * s2, -diff * cs, -diff * s2],
                    [-diff * c2, -diff * cs,  diff * c2,  diff * cs],
                    [-diff * cs, -diff * s2,  diff * cs,  diff * s2],
                ];

                for i in 0..4 {
                    for j in 0..4 {
                        k_global[cable_dofs[i] * n + cable_dofs[j]] += dk[i][j];
                    }
                }
            }
        }

        // Solve
        let free_idx: Vec<usize> = (0..nf).collect();
        let k_ff = extract_submatrix(&k_global, n, &free_idx, &free_idx);
        let f_f: Vec<f64> = f_global[..nf].to_vec();
        let (k_solve, f_solve) = if let Some(ref cs) = cs {
            (cs.reduce_matrix(&k_ff), cs.reduce_vector(&f_f))
        } else {
            (k_ff, f_f)
        };
        let u_indep = solve_system(&k_solve, &f_solve, ns)?;
        let u_f = if let Some(ref cs) = cs {
            cs.expand_solution(&u_indep)
        } else {
            u_indep
        };

        for i in 0..nf {
            u_full[i] = u_f[i];
        }

        // Update cable tensions from deformed geometry
        let mut max_tension_change = 0.0_f64;

        for ci in &cables {
            let u_xi = dof_num.global_dof(ci.node_i_id, 0).map(|d| u_full[d]).unwrap_or(0.0);
            let u_yi = dof_num.global_dof(ci.node_i_id, 1).map(|d| u_full[d]).unwrap_or(0.0);
            let u_xj = dof_num.global_dof(ci.node_j_id, 0).map(|d| u_full[d]).unwrap_or(0.0);
            let u_yj = dof_num.global_dof(ci.node_j_id, 1).map(|d| u_full[d]).unwrap_or(0.0);

            let dx_def = ci.dx + u_xj - u_xi;
            let dy_def = ci.dy + u_yj - u_yi;
            let l_def = (dx_def * dx_def + dy_def * dy_def).sqrt();

            let strain = (l_def - ci.l0) / ci.l0;
            let tension = if strain > 0.0 { ci.ea * strain } else { 0.0 };

            let old_tension = cable_tensions[&ci.elem_id];
            let change = (tension - old_tension).abs();
            let ref_val = old_tension.abs().max(tension.abs()).max(1.0);
            max_tension_change = max_tension_change.max(change / ref_val);

            cable_tensions.insert(ci.elem_id, tension);
        }

        if max_tension_change < tolerance && iter > 0 {
            converged = true;
            break;
        }
    }

    // Build results
    let displacements = linear::build_displacements_2d(&dof_num, &u_full);

    let nr = n - nf;
    let rest_idx: Vec<usize> = (nf..n).collect();
    let free_idx: Vec<usize> = (0..nf).collect();
    let k_rf = extract_submatrix(&base_asm.k, n, &rest_idx, &free_idx);
    let f_r = extract_subvec(&f_global, &rest_idx);
    let u_f: Vec<f64> = u_full[..nf].to_vec();
    let k_rf_uf = mat_vec_rect(&k_rf, &u_f, nr, nf);
    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        reactions_vec[i] = k_rf_uf[i] - f_r[i];
    }

    let mut reactions = linear::build_reactions_2d(input, &dof_num, &reactions_vec, &f_r, nf, &u_full);
    reactions.sort_by_key(|r| r.node_id);

    let mut element_forces = linear::compute_internal_forces_2d(input, &dof_num, &u_full);
    element_forces.sort_by_key(|ef| ef.element_id);

    // Compute constraint forces if constraints are active
    let constraint_forces = if let Some(ref fcs) = cs {
        let k_ff = extract_submatrix(&base_asm.k, n, &free_idx, &free_idx);
        let raw = fcs.compute_constraint_forces(&k_ff, &u_full[..nf], &base_asm.f[..nf]);
        super::constraints::map_dof_forces_to_constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    let results = AnalysisResults {
        displacements,
        reactions,
        element_forces,
        constraint_forces,
        diagnostics: vec![],
        solver_diagnostics: vec![],
    };

    // Cable-specific results
    let cable_forces = cables.iter().map(|ci| {
        let tension = cable_tensions[&ci.elem_id];
        let l_h = ci.dx.abs().max(1e-10);
        let h_thrust = tension * l_h / ci.l0;
        let sag = if h_thrust > 1e-10 && ci.w > 1e-15 {
            element::cable_sag(ci.w, l_h, h_thrust)
        } else {
            0.0
        };
        let e_eq = if tension > 1e-10 && ci.w > 1e-15 {
            let e = ci.ea / 1.0; // EA/A = E (approximately)
            element::ernst_equivalent_modulus(e, 1.0, ci.w, l_h, tension)
        } else {
            ci.ea / ci.l0
        };
        CableElementResult {
            element_id: ci.elem_id,
            tension,
            horizontal_thrust: h_thrust,
            sag,
            ernst_modulus: e_eq,
            unstretched_length: ci.l0,
        }
    }).collect();

    Ok(CableAnalysisResult2D {
        results,
        iterations: total_iterations,
        converged,
        cable_forces,
    })
}

/// Solve a 3D structure containing cable elements.
pub fn solve_cable_3d(
    input: &SolverInput3D,
    densities: &HashMap<String, f64>,
    max_iter: usize,
    tolerance: f64,
) -> Result<CableAnalysisResult3D, String> {
    let dof_num = DofNumbering::build_3d(input);

    if dof_num.n_free == 0 {
        return Err("No free DOFs — all nodes are fully restrained".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_3d(&input.constraints, &dof_num, &input.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    let has_cables = input.elements.values().any(|e| e.elem_type == "cable");

    if !has_cables {
        let results = linear::solve_3d(input)?;
        return Ok(CableAnalysisResult3D {
            results,
            iterations: 1,
            converged: true,
            cable_forces: Vec::new(),
        });
    }

    // Build O(1) lookup maps by id
    let node_by_id: HashMap<usize, &SolverNode3D> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection3D> =
        input.sections.values().map(|s| (s.id, s)).collect();

    let mut cables: Vec<CableGeom3D> = Vec::new();
    let mut cable_tensions: HashMap<usize, f64> = HashMap::new();

    for elem in input.elements.values() {
        if elem.elem_type != "cable" {
            continue;
        }
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let dz = node_j.z - node_i.z;
        let l0 = (dx * dx + dy * dy + dz * dz).sqrt();
        let e = mat.e * 1000.0;

        let density = densities.get(&elem.material_id.to_string())
            .copied().unwrap_or(0.0) / 1000.0; // kg/m³ → t/m³
        let w = element::cable_self_weight(density, sec.a);

        cables.push(CableGeom3D {
            elem_id: elem.id,
            node_i_id: elem.node_i,
            node_j_id: elem.node_j,
            l0, dx, dy, dz,
            dir: [dx / l0, dy / l0, dz / l0],
            ea: e * sec.a,
            w,
        });
        cable_tensions.insert(elem.id, 0.0);
    }

    let base_asm = assembly::assemble_3d(input, &dof_num);
    let f_global = base_asm.f.clone();

    let mut u_full = vec![0.0; n];
    let mut converged = false;
    let mut total_iterations = 0;

    for iter in 0..max_iter {
        total_iterations = iter + 1;

        let mut k_global = base_asm.k.clone();

        for ci in &cables {
            let tension = cable_tensions[&ci.elem_id];
            let l_h = (ci.dx * ci.dx + ci.dy * ci.dy).sqrt().max(1e-10);

            let e_eq_factor = if tension > 1e-10 && ci.w > 1e-15 {
                let wl = ci.w * l_h;
                1.0 / (1.0 + wl * wl * ci.ea / (12.0 * tension.powi(3)))
            } else if tension <= 0.0 && iter > 0 {
                0.0
            } else {
                1.0
            };

            if (e_eq_factor - 1.0).abs() > 1e-15 {
                let ea_l = ci.ea / ci.l0;
                let diff = (e_eq_factor - 1.0) * ea_l;

                for a in 0..2 {
                    for b in 0..2 {
                        let sign = if a == b { 1.0 } else { -1.0 };
                        let node_a = if a == 0 { ci.node_i_id } else { ci.node_j_id };
                        let node_b = if b == 0 { ci.node_i_id } else { ci.node_j_id };
                        for i in 0..3 {
                            for j in 0..3 {
                                if let (Some(&da), Some(&db)) = (
                                    dof_num.map.get(&(node_a, i)),
                                    dof_num.map.get(&(node_b, j)),
                                ) {
                                    k_global[da * n + db] += sign * diff * ci.dir[i] * ci.dir[j];
                                }
                            }
                        }
                    }
                }
            }
        }

        let free_idx: Vec<usize> = (0..nf).collect();
        let k_ff = extract_submatrix(&k_global, n, &free_idx, &free_idx);
        let f_f: Vec<f64> = f_global[..nf].to_vec();
        let (k_solve, f_solve) = if let Some(ref cs) = cs {
            (cs.reduce_matrix(&k_ff), cs.reduce_vector(&f_f))
        } else {
            (k_ff, f_f)
        };
        let u_indep = solve_system(&k_solve, &f_solve, ns)?;
        let u_f = if let Some(ref cs) = cs {
            cs.expand_solution(&u_indep)
        } else {
            u_indep
        };

        for i in 0..nf {
            u_full[i] = u_f[i];
        }

        let mut max_tension_change = 0.0_f64;

        for ci in &cables {
            let u_i: Vec<f64> = (0..3).map(|d| {
                dof_num.global_dof(ci.node_i_id, d).map(|dd| u_full[dd]).unwrap_or(0.0)
            }).collect();
            let u_j: Vec<f64> = (0..3).map(|d| {
                dof_num.global_dof(ci.node_j_id, d).map(|dd| u_full[dd]).unwrap_or(0.0)
            }).collect();

            let dx_def = ci.dx + u_j[0] - u_i[0];
            let dy_def = ci.dy + u_j[1] - u_i[1];
            let dz_def = ci.dz + u_j[2] - u_i[2];
            let l_def = (dx_def * dx_def + dy_def * dy_def + dz_def * dz_def).sqrt();

            let strain = (l_def - ci.l0) / ci.l0;
            let tension = if strain > 0.0 { ci.ea * strain } else { 0.0 };

            let old_tension = cable_tensions[&ci.elem_id];
            let change = (tension - old_tension).abs();
            let ref_val = old_tension.abs().max(tension.abs()).max(1.0);
            max_tension_change = max_tension_change.max(change / ref_val);

            cable_tensions.insert(ci.elem_id, tension);
        }

        if max_tension_change < tolerance && iter > 0 {
            converged = true;
            break;
        }
    }

    let displacements = linear::build_displacements_3d(&dof_num, &u_full);

    let nr = n - nf;
    let rest_idx: Vec<usize> = (nf..n).collect();
    let free_idx: Vec<usize> = (0..nf).collect();
    let k_rf = extract_submatrix(&base_asm.k, n, &rest_idx, &free_idx);
    let f_r = extract_subvec(&f_global, &rest_idx);
    let u_f: Vec<f64> = u_full[..nf].to_vec();
    let k_rf_uf = mat_vec_rect(&k_rf, &u_f, nr, nf);
    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        reactions_vec[i] = k_rf_uf[i] - f_r[i];
    }

    let mut reactions = linear::build_reactions_3d(input, &dof_num, &reactions_vec, &f_r, nf, &u_full);
    reactions.sort_by_key(|r| r.node_id);

    let mut element_forces = linear::compute_internal_forces_3d(input, &dof_num, &u_full);
    element_forces.sort_by_key(|ef| ef.element_id);

    // Compute constraint forces if constraints are active
    let constraint_forces = if let Some(ref fcs) = cs {
        let k_ff = extract_submatrix(&base_asm.k, n, &free_idx, &free_idx);
        let raw = fcs.compute_constraint_forces(&k_ff, &u_full[..nf], &base_asm.f[..nf]);
        super::constraints::map_dof_forces_to_constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    let results = AnalysisResults3D {
        displacements,
        reactions,
        element_forces,
        plate_stresses: linear::compute_plate_stresses(input, &dof_num, &u_full),
        quad_stresses: linear::compute_quad_stresses(input, &dof_num, &u_full),
        quad_nodal_stresses: vec![],
        constraint_forces,
        diagnostics: vec![],
        solver_diagnostics: vec![],
        timings: None,
    };

    let cable_forces = cables.iter().map(|ci| {
        let tension = cable_tensions[&ci.elem_id];
        let l_h = (ci.dx * ci.dx + ci.dy * ci.dy).sqrt().max(1e-10);
        let h_thrust = tension * l_h / ci.l0;
        let sag = if h_thrust > 1e-10 && ci.w > 1e-15 {
            element::cable_sag(ci.w, l_h, h_thrust)
        } else {
            0.0
        };
        CableElementResult {
            element_id: ci.elem_id,
            tension,
            horizontal_thrust: h_thrust,
            sag,
            ernst_modulus: ci.ea / ci.l0,
            unstretched_length: ci.l0,
        }
    }).collect();

    Ok(CableAnalysisResult3D {
        results,
        iterations: total_iterations,
        converged,
        cable_forces,
    })
}
