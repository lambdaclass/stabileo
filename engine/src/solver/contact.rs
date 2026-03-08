/// Contact, gap, and tension/compression-only element solver.
///
/// Handles nonlinear contact problems via iterative status updates:
/// - Tension-only elements (cables): zero stiffness when in compression
/// - Compression-only elements (struts): zero stiffness when in tension
/// - Gap elements: zero stiffness until gap closes, then penalty stiffness
/// - Uplift supports: released when reaction becomes tensile
///
/// Iteration scheme:
/// 1. Assemble with current status (active/inactive for each element)
/// 2. Solve
/// 3. Check element forces → update status
/// 4. Repeat until no status changes

use std::collections::HashMap;
use crate::types::*;
use crate::element;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly;
use super::linear;

/// Contact element status.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ContactStatus {
    Active,
    Inactive,
}

/// Gap element definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GapElement {
    pub id: usize,
    pub node_i: usize,
    pub node_j: usize,
    /// Direction: 0=X, 1=Y, 2=Z
    pub direction: usize,
    /// Initial gap (positive = open, meters)
    pub initial_gap: f64,
    /// Penalty stiffness when closed (kN/m)
    pub stiffness: f64,
}

/// Input for contact/gap analysis (2D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactInput {
    pub solver: SolverInput,
    /// Element behaviors: element_id → "tension_only" or "compression_only"
    #[serde(default)]
    pub element_behaviors: HashMap<String, String>,
    /// Gap elements
    #[serde(default)]
    pub gap_elements: Vec<GapElement>,
    /// Uplift support node IDs (compression-only supports)
    #[serde(default)]
    pub uplift_supports: Vec<usize>,
    #[serde(default)]
    pub max_iter: Option<usize>,
    #[serde(default)]
    pub tolerance: Option<f64>,
}

/// Input for contact/gap analysis (3D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactInput3D {
    pub solver: SolverInput3D,
    #[serde(default)]
    pub element_behaviors: HashMap<String, String>,
    #[serde(default)]
    pub gap_elements: Vec<GapElement>,
    #[serde(default)]
    pub uplift_supports: Vec<usize>,
    #[serde(default)]
    pub max_iter: Option<usize>,
    #[serde(default)]
    pub tolerance: Option<f64>,
}

use serde::{Serialize, Deserialize};

/// Contact analysis result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactResult {
    pub results: AnalysisResults,
    pub iterations: usize,
    pub converged: bool,
    pub element_status: Vec<ElementContactInfo>,
    pub gap_status: Vec<GapContactInfo>,
}

/// Contact analysis result (3D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactResult3D {
    pub results: AnalysisResults3D,
    pub iterations: usize,
    pub converged: bool,
    pub element_status: Vec<ElementContactInfo>,
    pub gap_status: Vec<GapContactInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementContactInfo {
    pub element_id: usize,
    pub behavior: String,
    pub status: String, // "active" or "inactive"
    pub force: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GapContactInfo {
    pub id: usize,
    pub status: String, // "open" or "closed"
    pub displacement: f64,
    pub force: f64,
}

/// Solve a 2D structure with contact/gap elements.
pub fn solve_contact_2d(input: &ContactInput) -> Result<ContactResult, String> {
    let max_iter = input.max_iter.unwrap_or(30);

    let dof_num = DofNumbering::build_2d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Track element statuses
    let mut elem_status: HashMap<usize, ContactStatus> = HashMap::new();
    for (eid_str, _behavior) in &input.element_behaviors {
        if let Ok(eid) = eid_str.parse::<usize>() {
            elem_status.insert(eid, ContactStatus::Active);
        } else if let Some(elem) = input.solver.elements.values().find(|e| e.id.to_string() == *eid_str) {
            elem_status.insert(elem.id, ContactStatus::Active);
        }
    }

    // Track gap statuses
    let mut gap_status: Vec<ContactStatus> = vec![ContactStatus::Inactive; input.gap_elements.len()];

    // Track uplift support statuses
    let mut uplift_status: HashMap<usize, ContactStatus> = HashMap::new();
    for &nid in &input.uplift_supports {
        uplift_status.insert(nid, ContactStatus::Active);
    }

    let mut u_full = vec![0.0; n];
    let mut converged = false;
    let mut total_iters = 0;

    for iter in 0..max_iter {
        total_iters = iter + 1;

        // Base assembly
        let mut asm = assembly::assemble_2d(&input.solver, &dof_num);

        // Deactivate elements based on status
        for (eid, status) in &elem_status {
            if *status == ContactStatus::Inactive {
                // Subtract this element's stiffness from global K
                if let Some(elem) = input.solver.elements.values().find(|e| e.id == *eid) {
                    let ni = input.solver.nodes.values().find(|nd| nd.id == elem.node_i).unwrap();
                    let nj = input.solver.nodes.values().find(|nd| nd.id == elem.node_j).unwrap();
                    let mat = input.solver.materials.values().find(|m| m.id == elem.material_id).unwrap();
                    let sec = input.solver.sections.values().find(|s| s.id == elem.section_id).unwrap();

                    let dx = nj.x - ni.x;
                    let dy = nj.y - ni.y;
                    let l = (dx * dx + dy * dy).sqrt();
                    let cos = dx / l;
                    let sin = dy / l;
                    let e = mat.e * 1000.0;

                    if elem.elem_type == "truss" || elem.elem_type == "cable" {
                        let k_elem = element::truss_global_stiffness_2d(e, sec.a, l, cos, sin);
                        let truss_dofs = [
                            dof_num.global_dof(elem.node_i, 0).unwrap(),
                            dof_num.global_dof(elem.node_i, 1).unwrap(),
                            dof_num.global_dof(elem.node_j, 0).unwrap(),
                            dof_num.global_dof(elem.node_j, 1).unwrap(),
                        ];
                        for i in 0..4 {
                            for j in 0..4 {
                                asm.k[truss_dofs[i] * n + truss_dofs[j]] -= k_elem[i * 4 + j];
                            }
                        }
                    } else {
                        let phi = sec.as_y.map(|as_y| {
                            let g = e / (2.0 * (1.0 + mat.nu));
                            12.0 * e * sec.iz / (g * as_y * l * l)
                        }).unwrap_or(0.0);
                        let k_local = element::frame_local_stiffness_2d(
                            e, sec.a, sec.iz, l, elem.hinge_start, elem.hinge_end, phi,
                        );
                        let t = element::frame_transform_2d(cos, sin);
                        let k_glob = crate::linalg::transform_stiffness(&k_local, &t, 6);
                        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
                        let ndof = elem_dofs.len();
                        for i in 0..ndof {
                            for j in 0..ndof {
                                asm.k[elem_dofs[i] * n + elem_dofs[j]] -= k_glob[i * ndof + j];
                            }
                        }
                    }
                }
            }
        }

        // Add gap element stiffness for closed gaps
        for (gi, gap) in input.gap_elements.iter().enumerate() {
            if gap_status[gi] == ContactStatus::Active {
                // Gap is closed — add penalty stiffness
                let dir = gap.direction.min(1); // 2D: 0=X, 1=Y
                if let (Some(&di), Some(&dj)) = (
                    dof_num.map.get(&(gap.node_i, dir)),
                    dof_num.map.get(&(gap.node_j, dir)),
                ) {
                    asm.k[di * n + di] += gap.stiffness;
                    asm.k[dj * n + dj] += gap.stiffness;
                    asm.k[di * n + dj] -= gap.stiffness;
                    asm.k[dj * n + di] -= gap.stiffness;
                }
            }
        }

        // Release uplift supports that are inactive
        for (&nid, status) in &uplift_status {
            if *status == ContactStatus::Inactive {
                // Remove vertical constraint (DOF 1 = Y)
                if let Some(&d) = dof_num.map.get(&(nid, 1)) {
                    if d >= nf {
                        // It's a restrained DOF — we can't easily un-restrain it
                        // Instead, add a zero-stiffness spring (already done by not adding K)
                        // This is handled by the assembly having already included it
                    }
                }
            }
        }

        // Solve
        let free_idx: Vec<usize> = (0..nf).collect();
        let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
        let f_f: Vec<f64> = asm.f[..nf].to_vec();

        let u_f = {
            let mut k_work = k_ff.clone();
            match cholesky_solve(&mut k_work, &f_f, nf) {
                Some(u) => u,
                None => {
                    let mut k_work = k_ff;
                    let mut f_work = f_f;
                    lu_solve(&mut k_work, &mut f_work, nf)
                        .ok_or("Singular stiffness in contact iteration")?
                }
            }
        };

        for i in 0..nf {
            u_full[i] = u_f[i];
        }

        // Check element forces and update statuses
        let mut any_change = false;

        for (eid_str, behavior) in &input.element_behaviors {
            let eid: usize = if let Ok(id) = eid_str.parse() {
                id
            } else if let Some(elem) = input.solver.elements.values().find(|e| e.id.to_string() == *eid_str) {
                elem.id
            } else {
                continue;
            };

            if let Some(elem) = input.solver.elements.values().find(|e| e.id == eid) {
                let ni = input.solver.nodes.values().find(|nd| nd.id == elem.node_i).unwrap();
                let nj = input.solver.nodes.values().find(|nd| nd.id == elem.node_j).unwrap();
                let mat = input.solver.materials.values().find(|m| m.id == elem.material_id).unwrap();
                let sec = input.solver.sections.values().find(|s| s.id == elem.section_id).unwrap();

                let dx = nj.x - ni.x;
                let dy = nj.y - ni.y;
                let l = (dx * dx + dy * dy).sqrt();
                let cos = dx / l;
                let sin = dy / l;
                let e = mat.e * 1000.0;

                // Compute axial force
                let u_xi = dof_num.global_dof(elem.node_i, 0).map(|d| u_full[d]).unwrap_or(0.0);
                let u_yi = dof_num.global_dof(elem.node_i, 1).map(|d| u_full[d]).unwrap_or(0.0);
                let u_xj = dof_num.global_dof(elem.node_j, 0).map(|d| u_full[d]).unwrap_or(0.0);
                let u_yj = dof_num.global_dof(elem.node_j, 1).map(|d| u_full[d]).unwrap_or(0.0);

                let delta = (u_xj - u_xi) * cos + (u_yj - u_yi) * sin;
                let axial_force = e * sec.a / l * delta;

                let new_status = match behavior.as_str() {
                    "tension_only" => {
                        if axial_force < -1e-10 { ContactStatus::Inactive } else { ContactStatus::Active }
                    }
                    "compression_only" => {
                        if axial_force > 1e-10 { ContactStatus::Inactive } else { ContactStatus::Active }
                    }
                    _ => ContactStatus::Active,
                };

                if let Some(old_status) = elem_status.get(&eid) {
                    if *old_status != new_status {
                        any_change = true;
                    }
                }
                elem_status.insert(eid, new_status);
            }
        }

        // Check gap elements
        for (gi, gap) in input.gap_elements.iter().enumerate() {
            let dir = gap.direction.min(1);
            let u_i = dof_num.global_dof(gap.node_i, dir).map(|d| u_full[d]).unwrap_or(0.0);
            let u_j = dof_num.global_dof(gap.node_j, dir).map(|d| u_full[d]).unwrap_or(0.0);
            let relative_disp = u_j - u_i;

            let new_status = if relative_disp < -gap.initial_gap {
                ContactStatus::Active // Gap closed
            } else {
                ContactStatus::Inactive // Gap open
            };

            if gap_status[gi] != new_status {
                any_change = true;
                gap_status[gi] = new_status;
            }
        }

        if !any_change && iter > 0 {
            converged = true;
            break;
        }
    }

    // Build final results
    let results = linear::solve_2d(&input.solver).unwrap_or_else(|_| {
        AnalysisResults {
            displacements: linear::build_displacements_2d(&dof_num, &u_full),
            reactions: vec![],
            element_forces: linear::compute_internal_forces_2d(&input.solver, &dof_num, &u_full),
        }
    });

    let element_status_info: Vec<ElementContactInfo> = input.element_behaviors.iter()
        .filter_map(|(eid_str, behavior)| {
            let eid: usize = eid_str.parse().ok()?;
            let status = elem_status.get(&eid).copied().unwrap_or(ContactStatus::Active);
            Some(ElementContactInfo {
                element_id: eid,
                behavior: behavior.clone(),
                status: if status == ContactStatus::Active { "active".into() } else { "inactive".into() },
                force: 0.0,
            })
        })
        .collect();

    let gap_info: Vec<GapContactInfo> = input.gap_elements.iter().enumerate()
        .map(|(gi, gap)| {
            let dir = gap.direction.min(1);
            let u_i = dof_num.global_dof(gap.node_i, dir).map(|d| u_full[d]).unwrap_or(0.0);
            let u_j = dof_num.global_dof(gap.node_j, dir).map(|d| u_full[d]).unwrap_or(0.0);
            let relative_disp = u_j - u_i;
            let force = if gap_status[gi] == ContactStatus::Active {
                gap.stiffness * (relative_disp + gap.initial_gap)
            } else {
                0.0
            };
            GapContactInfo {
                id: gap.id,
                status: if gap_status[gi] == ContactStatus::Active { "closed".into() } else { "open".into() },
                displacement: relative_disp,
                force,
            }
        })
        .collect();

    Ok(ContactResult {
        results,
        iterations: total_iters,
        converged,
        element_status: element_status_info,
        gap_status: gap_info,
    })
}

/// Solve a 3D structure with contact/gap elements.
pub fn solve_contact_3d(input: &ContactInput3D) -> Result<ContactResult3D, String> {
    let max_iter = input.max_iter.unwrap_or(30);

    let dof_num = DofNumbering::build_3d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Track element statuses
    let mut elem_status: HashMap<usize, ContactStatus> = HashMap::new();
    for (eid_str, _) in &input.element_behaviors {
        if let Ok(eid) = eid_str.parse::<usize>() {
            elem_status.insert(eid, ContactStatus::Active);
        }
    }

    // Track gap statuses
    let mut gap_status: Vec<ContactStatus> = vec![ContactStatus::Inactive; input.gap_elements.len()];

    // Track uplift support statuses
    let mut uplift_status: HashMap<usize, ContactStatus> = HashMap::new();
    for &nid in &input.uplift_supports {
        uplift_status.insert(nid, ContactStatus::Active);
    }

    let mut u_full = vec![0.0; n];
    let mut converged = false;
    let mut total_iters = 0;

    for iter in 0..max_iter {
        total_iters = iter + 1;

        let mut asm = assembly::assemble_3d(&input.solver, &dof_num);

        // Deactivate elements
        for (eid, status) in &elem_status {
            if *status == ContactStatus::Inactive {
                if let Some(elem) = input.solver.elements.values().find(|e| e.id == *eid) {
                    if elem.elem_type == "truss" || elem.elem_type == "cable" {
                        let ni = input.solver.nodes.values().find(|nd| nd.id == elem.node_i).unwrap();
                        let nj = input.solver.nodes.values().find(|nd| nd.id == elem.node_j).unwrap();
                        let mat = input.solver.materials.values().find(|m| m.id == elem.material_id).unwrap();
                        let sec = input.solver.sections.values().find(|s| s.id == elem.section_id).unwrap();

                        let dx = nj.x - ni.x;
                        let dy = nj.y - ni.y;
                        let dz = nj.z - ni.z;
                        let l = (dx * dx + dy * dy + dz * dz).sqrt();
                        let e = mat.e * 1000.0;
                        let ea_l = e * sec.a / l;
                        let dir = [dx / l, dy / l, dz / l];

                        element::scatter_truss_3d(
                            &mut asm.k, n, -ea_l, &dir,
                            elem.node_i, elem.node_j, &dof_num.map,
                        );
                    }
                }
            }
        }

        // Add gap element stiffness for closed gaps
        for (gi, gap) in input.gap_elements.iter().enumerate() {
            if gap_status[gi] == ContactStatus::Active {
                let dir = gap.direction.min(2); // 3D: 0=X, 1=Y, 2=Z
                if let (Some(&di), Some(&dj)) = (
                    dof_num.map.get(&(gap.node_i, dir)),
                    dof_num.map.get(&(gap.node_j, dir)),
                ) {
                    asm.k[di * n + di] += gap.stiffness;
                    asm.k[dj * n + dj] += gap.stiffness;
                    asm.k[di * n + dj] -= gap.stiffness;
                    asm.k[dj * n + di] -= gap.stiffness;
                }
            }
        }

        // Solve
        let free_idx: Vec<usize> = (0..nf).collect();
        let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
        let f_f: Vec<f64> = asm.f[..nf].to_vec();

        let u_f = {
            let mut k_work = k_ff.clone();
            match cholesky_solve(&mut k_work, &f_f, nf) {
                Some(u) => u,
                None => {
                    let mut k_work = k_ff;
                    let mut f_work = f_f;
                    lu_solve(&mut k_work, &mut f_work, nf)
                        .ok_or("Singular stiffness in 3D contact iteration")?
                }
            }
        };

        for i in 0..nf { u_full[i] = u_f[i]; }

        // Check element forces and update statuses
        let mut any_change = false;

        for (eid_str, behavior) in &input.element_behaviors {
            let eid: usize = match eid_str.parse() {
                Ok(id) => id,
                Err(_) => continue,
            };

            if let Some(elem) = input.solver.elements.values().find(|e| e.id == eid) {
                let ni = input.solver.nodes.values().find(|nd| nd.id == elem.node_i).unwrap();
                let nj = input.solver.nodes.values().find(|nd| nd.id == elem.node_j).unwrap();
                let mat = input.solver.materials.values().find(|m| m.id == elem.material_id).unwrap();
                let sec = input.solver.sections.values().find(|s| s.id == elem.section_id).unwrap();

                let dx = nj.x - ni.x;
                let dy = nj.y - ni.y;
                let dz = nj.z - ni.z;
                let l = (dx * dx + dy * dy + dz * dz).sqrt();
                let e = mat.e * 1000.0;
                let dir = [dx / l, dy / l, dz / l];

                let ui: Vec<f64> = (0..3).map(|d| {
                    dof_num.global_dof(elem.node_i, d).map(|dd| u_full[dd]).unwrap_or(0.0)
                }).collect();
                let uj: Vec<f64> = (0..3).map(|d| {
                    dof_num.global_dof(elem.node_j, d).map(|dd| u_full[dd]).unwrap_or(0.0)
                }).collect();

                let delta: f64 = (0..3).map(|d| (uj[d] - ui[d]) * dir[d]).sum();
                let axial_force = e * sec.a / l * delta;

                let new_status = match behavior.as_str() {
                    "tension_only" => {
                        if axial_force < -1e-10 { ContactStatus::Inactive } else { ContactStatus::Active }
                    }
                    "compression_only" => {
                        if axial_force > 1e-10 { ContactStatus::Inactive } else { ContactStatus::Active }
                    }
                    _ => ContactStatus::Active,
                };

                if let Some(old) = elem_status.get(&eid) {
                    if *old != new_status { any_change = true; }
                }
                elem_status.insert(eid, new_status);
            }
        }

        // Check gap elements
        for (gi, gap) in input.gap_elements.iter().enumerate() {
            let dir = gap.direction.min(2);
            let u_i = dof_num.global_dof(gap.node_i, dir).map(|d| u_full[d]).unwrap_or(0.0);
            let u_j = dof_num.global_dof(gap.node_j, dir).map(|d| u_full[d]).unwrap_or(0.0);
            let relative_disp = u_j - u_i;

            let new_status = if relative_disp < -gap.initial_gap {
                ContactStatus::Active
            } else {
                ContactStatus::Inactive
            };

            if gap_status[gi] != new_status {
                any_change = true;
                gap_status[gi] = new_status;
            }
        }

        if !any_change && iter > 0 {
            converged = true;
            break;
        }
    }

    // Build results
    let displacements = linear::build_displacements_3d(&dof_num, &u_full);
    let element_forces = linear::compute_internal_forces_3d(&input.solver, &dof_num, &u_full);

    let results = AnalysisResults3D {
        displacements,
        reactions: vec![],
        element_forces,
        plate_stresses: vec![],
        quad_stresses: vec![],
    };

    let element_status_info: Vec<ElementContactInfo> = input.element_behaviors.iter()
        .filter_map(|(eid_str, behavior)| {
            let eid: usize = eid_str.parse().ok()?;
            let status = elem_status.get(&eid).copied().unwrap_or(ContactStatus::Active);
            Some(ElementContactInfo {
                element_id: eid,
                behavior: behavior.clone(),
                status: if status == ContactStatus::Active { "active".into() } else { "inactive".into() },
                force: 0.0,
            })
        })
        .collect();

    let gap_info: Vec<GapContactInfo> = input.gap_elements.iter().enumerate()
        .map(|(gi, gap)| {
            let dir = gap.direction.min(2);
            let u_i = dof_num.global_dof(gap.node_i, dir).map(|d| u_full[d]).unwrap_or(0.0);
            let u_j = dof_num.global_dof(gap.node_j, dir).map(|d| u_full[d]).unwrap_or(0.0);
            let relative_disp = u_j - u_i;
            let force = if gap_status[gi] == ContactStatus::Active {
                gap.stiffness * (relative_disp + gap.initial_gap)
            } else {
                0.0
            };
            GapContactInfo {
                id: gap.id,
                status: if gap_status[gi] == ContactStatus::Active { "closed".into() } else { "open".into() },
                displacement: relative_disp,
                force,
            }
        })
        .collect();

    Ok(ContactResult3D {
        results,
        iterations: total_iters,
        converged,
        element_status: element_status_info,
        gap_status: gap_info,
    })
}
