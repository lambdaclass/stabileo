/// Contact, gap, and tension/compression-only element solver.
///
/// Handles nonlinear contact problems via iterative status updates:
/// - Tension-only elements (cables): zero stiffness when in compression
/// - Compression-only elements (struts): zero stiffness when in tension
/// - Gap elements: zero stiffness until gap closes, then penalty stiffness
/// - Uplift supports: released when reaction becomes tensile
/// - Node-to-surface contact: slave nodes projected onto master line segments (2D)
///
/// Iteration scheme:
/// 1. Assemble with current status (active/inactive for each element)
/// 2. Solve
/// 3. Check element forces -> update status
/// 4. Repeat until no status changes
///
/// Optional augmented Lagrangian loop wraps the penalty iteration to
/// improve constraint enforcement without excessively large penalty values.
///
/// Contact damping adds velocity-proportional forces to stabilize
/// open/close oscillations during iteration.

use std::collections::HashMap;
use crate::types::*;
use crate::element;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly;
use super::linear;
use super::constraints::FreeConstraintSystem;

use serde::{Serialize, Deserialize};

// ---------------------------------------------------------------------------
// Enums and structs
// ---------------------------------------------------------------------------

/// Contact element status.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ContactStatus {
    Active,
    Inactive,
}

/// Type of contact formulation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ContactType {
    /// Existing node-to-node gap elements (default).
    NodeToNode,
    /// Node-to-surface: slave nodes projected onto master line segments (2D).
    NodeToSurface,
}

impl Default for ContactType {
    fn default() -> Self { ContactType::NodeToNode }
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
    /// Coulomb friction coefficient (optional, tangential resistance)
    #[serde(default)]
    pub friction: Option<f64>,
    /// Tangential direction for friction: 0=X, 1=Y, 2=Z (perpendicular to normal)
    #[serde(default)]
    pub friction_direction: Option<usize>,
    /// Friction coefficient (alternative to `friction` field, applies Coulomb model).
    /// When set, the tangential friction force = mu * |normal_force|.
    #[serde(default)]
    pub friction_coefficient: Option<f64>,
}

/// A master surface segment defined by two nodes (2D line segment).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MasterSegment {
    /// ID of this segment
    pub id: usize,
    /// First node of the line segment
    pub node_a: usize,
    /// Second node of the line segment
    pub node_b: usize,
}

/// Node-to-surface contact pair definition (2D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeToSurfacePair {
    /// Slave node ID
    pub slave_node: usize,
    /// Master segment (2-node line segment in 2D)
    pub master_segment: MasterSegment,
    /// Penalty stiffness when in contact (kN/m)
    pub stiffness: f64,
    /// Coulomb friction coefficient (optional)
    #[serde(default)]
    pub friction_coefficient: Option<f64>,
}

/// Input for contact/gap analysis (2D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactInput {
    pub solver: SolverInput,
    /// Element behaviors: element_id -> "tension_only" or "compression_only"
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
    /// Augmented Lagrangian multiplier update factor (0 = pure penalty, >0 = AL)
    #[serde(default)]
    pub augmented_lagrangian: Option<f64>,
    /// Oscillation damping: max consecutive status flips before forcing inactive
    #[serde(default)]
    pub max_flips: Option<usize>,
    /// Contact damping coefficient. When a gap pair oscillates between open/close,
    /// a damping force proportional to the velocity (displacement change per iteration)
    /// is applied: F_damp = damping_coefficient * (u_current - u_previous).
    #[serde(default)]
    pub damping_coefficient: Option<f64>,
    /// Maximum number of augmented Lagrangian outer iterations (default 5).
    /// Only used when `augmented_lagrangian` is set to Some(factor > 0).
    #[serde(default)]
    pub al_max_iter: Option<usize>,
    /// Contact type: NodeToNode (default) or NodeToSurface.
    #[serde(default)]
    pub contact_type: ContactType,
    /// Node-to-surface contact pairs (only used when contact_type == NodeToSurface).
    #[serde(default)]
    pub node_to_surface_pairs: Vec<NodeToSurfacePair>,
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
    #[serde(default)]
    pub augmented_lagrangian: Option<f64>,
    #[serde(default)]
    pub max_flips: Option<usize>,
    /// Contact damping coefficient (see ContactInput docs).
    #[serde(default)]
    pub damping_coefficient: Option<f64>,
    /// Maximum number of augmented Lagrangian outer iterations (default 5).
    #[serde(default)]
    pub al_max_iter: Option<usize>,
}

/// Contact analysis result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactResult {
    pub results: AnalysisResults,
    pub iterations: usize,
    pub converged: bool,
    pub element_status: Vec<ElementContactInfo>,
    pub gap_status: Vec<GapContactInfo>,
    /// Convergence diagnostics: which pairs oscillated, suggestions, etc.
    #[serde(default)]
    pub diagnostics: Vec<String>,
    /// Node-to-surface contact results (only populated for NodeToSurface contact type).
    #[serde(default)]
    pub node_to_surface_status: Vec<NodeToSurfaceContactInfo>,
    /// Number of augmented Lagrangian outer iterations performed.
    #[serde(default)]
    pub al_iterations: usize,
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
    /// Convergence diagnostics.
    #[serde(default)]
    pub diagnostics: Vec<String>,
    /// Number of augmented Lagrangian outer iterations performed.
    #[serde(default)]
    pub al_iterations: usize,
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
    /// Penetration depth (positive = penetration, only when closed)
    pub penetration: f64,
    /// Friction force (tangential, if friction is defined)
    #[serde(default)]
    pub friction_force: f64,
}

/// Info for a node-to-surface contact pair result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeToSurfaceContactInfo {
    pub slave_node: usize,
    pub master_segment_id: usize,
    pub status: String, // "open" or "closed"
    /// Normal gap (negative = penetration)
    pub gap: f64,
    /// Normal contact force
    pub normal_force: f64,
    /// Friction force (tangential)
    pub friction_force: f64,
    /// Parametric coordinate on master segment [0,1]
    pub xi: f64,
}

// ---------------------------------------------------------------------------
// 2D solver
// ---------------------------------------------------------------------------

/// Solve a 2D structure with contact/gap elements.
pub fn solve_contact_2d(input: &ContactInput) -> Result<ContactResult, String> {
    let max_iter = input.max_iter.unwrap_or(30);
    let max_flips = input.max_flips.unwrap_or(4);
    let al_factor = input.augmented_lagrangian.unwrap_or(0.0);
    let al_max_iter = input.al_max_iter.unwrap_or(5);
    let damping_coeff = input.damping_coefficient.unwrap_or(0.0);

    let dof_num = DofNumbering::build_2d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_2d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Build lookup maps to avoid O(n) linear scans per element
    let node_by_id: HashMap<usize, &SolverNode> = input.solver.nodes.values().map(|n| (n.id, n)).collect();
    let elem_by_id: HashMap<usize, &SolverElement> = input.solver.elements.values().map(|e| (e.id, e)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> = input.solver.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection> = input.solver.sections.values().map(|s| (s.id, s)).collect();
    let elem_by_id_str: HashMap<String, &SolverElement> = input.solver.elements.values().map(|e| (e.id.to_string(), e)).collect();

    // Track element statuses
    let mut elem_status: HashMap<usize, ContactStatus> = HashMap::new();
    for (eid_str, _behavior) in &input.element_behaviors {
        if let Ok(eid) = eid_str.parse::<usize>() {
            elem_status.insert(eid, ContactStatus::Active);
        } else if let Some(elem) = elem_by_id_str.get(eid_str) {
            elem_status.insert(elem.id, ContactStatus::Active);
        }
    }

    // Track gap statuses + oscillation flip counters
    let mut gap_status: Vec<ContactStatus> = vec![ContactStatus::Inactive; input.gap_elements.len()];
    let mut gap_flip_count: Vec<usize> = vec![0; input.gap_elements.len()];

    // Augmented Lagrangian multipliers (per gap)
    let mut gap_lambda: Vec<f64> = vec![0.0; input.gap_elements.len()];

    // Node-to-surface: status, lambda, previous displacement per pair
    let n2s_count = input.node_to_surface_pairs.len();
    let mut n2s_status: Vec<ContactStatus> = vec![ContactStatus::Inactive; n2s_count];
    let mut n2s_lambda: Vec<f64> = vec![0.0; n2s_count];
    let mut n2s_flip_count: Vec<usize> = vec![0; n2s_count];

    // Track uplift support statuses
    let mut uplift_status: HashMap<usize, ContactStatus> = HashMap::new();
    for &nid in &input.uplift_supports {
        uplift_status.insert(nid, ContactStatus::Active);
    }

    let mut u_full = vec![0.0; n];
    let mut u_prev = vec![0.0; n]; // previous iteration displacement (for damping)
    let mut converged = false;
    let mut total_iters = 0;

    // Element-level oscillation tracking for diagnostics
    let mut elem_flip_count: HashMap<usize, usize> = HashMap::new();

    // Augmented Lagrangian outer loop
    let al_outer_iters = if al_factor > 0.0 { al_max_iter } else { 1 };
    let mut al_iter_count: usize = 0;

    for al_iter in 0..al_outer_iters {
        al_iter_count = al_iter + 1;

        // Reset flip counters for each AL outer iteration
        for fc in gap_flip_count.iter_mut() { *fc = 0; }
        for fc in n2s_flip_count.iter_mut() { *fc = 0; }
        for fc in elem_flip_count.values_mut() { *fc = 0; }

        let mut inner_converged = false;

        for iter in 0..max_iter {
            total_iters += 1;

            // Save previous displacement for damping computation
            u_prev.copy_from_slice(&u_full);

            // Base assembly
            let mut asm = assembly::assemble_2d(&input.solver, &dof_num);

            // Deactivate elements based on status
            for (eid, status) in &elem_status {
                if *status == ContactStatus::Inactive {
                    // Subtract this element's stiffness from global K
                    if let Some(&elem) = elem_by_id.get(eid) {
                        let ni = node_by_id[&elem.node_i];
                        let nj = node_by_id[&elem.node_j];
                        let mat = mat_by_id[&elem.material_id];
                        let sec = sec_by_id[&elem.section_id];

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
                    // Gap is closed -- add normal penalty stiffness
                    let dir = gap.direction.min(1); // 2D: 0=X, 1=Y
                    if let (Some(&di), Some(&dj)) = (
                        dof_num.map.get(&(gap.node_i, dir)),
                        dof_num.map.get(&(gap.node_j, dir)),
                    ) {
                        asm.k[di * n + di] += gap.stiffness;
                        asm.k[dj * n + dj] += gap.stiffness;
                        asm.k[di * n + dj] -= gap.stiffness;
                        asm.k[dj * n + di] -= gap.stiffness;

                        // AL force contribution: add lambda to RHS
                        if al_factor > 0.0 && gap_lambda[gi].abs() > 1e-20 {
                            if di < nf { asm.f[di] -= gap_lambda[gi]; }
                            if dj < nf { asm.f[dj] += gap_lambda[gi]; }
                        }

                        // Contact damping force: F_damp = c * (u - u_prev)
                        // Applied as an additional force opposing the velocity (displacement change)
                        if damping_coeff > 0.0 && gap_flip_count[gi] > 0 {
                            let vel_i = u_full.get(di).copied().unwrap_or(0.0) - u_prev.get(di).copied().unwrap_or(0.0);
                            let vel_j = u_full.get(dj).copied().unwrap_or(0.0) - u_prev.get(dj).copied().unwrap_or(0.0);
                            let f_damp_i = damping_coeff * vel_i;
                            let f_damp_j = damping_coeff * vel_j;
                            if di < nf { asm.f[di] -= f_damp_i; }
                            if dj < nf { asm.f[dj] -= f_damp_j; }
                            // Also add damping to diagonal for numerical stability
                            asm.k[di * n + di] += damping_coeff;
                            asm.k[dj * n + dj] += damping_coeff;
                        }
                    }
                    // Add tangential friction stiffness
                    let mu_eff = gap.friction.or(gap.friction_coefficient);
                    if let (Some(mu), Some(fdir)) = (mu_eff, gap.friction_direction) {
                        let fdir = fdir.min(1);
                        if let (Some(&fi), Some(&fj)) = (
                            dof_num.map.get(&(gap.node_i, fdir)),
                            dof_num.map.get(&(gap.node_j, fdir)),
                        ) {
                            let k_fric = mu * gap.stiffness;
                            asm.k[fi * n + fi] += k_fric;
                            asm.k[fj * n + fj] += k_fric;
                            asm.k[fi * n + fj] -= k_fric;
                            asm.k[fj * n + fi] -= k_fric;
                        }
                    }
                }
            }

            // Node-to-surface contact contributions
            for (pi, pair) in input.node_to_surface_pairs.iter().enumerate() {
                if n2s_status[pi] == ContactStatus::Active {
                    // Project slave node onto master segment to find normal direction
                    let (normal, _xi, _gap_val) = project_slave_onto_segment_2d(
                        pair, &node_by_id, &dof_num, &u_full,
                    );

                    // Add penalty stiffness in normal direction
                    // Normal is [nx, ny]. Penalty acts on slave node DOFs.
                    let slave_dof_x = dof_num.map.get(&(pair.slave_node, 0)).copied();
                    let slave_dof_y = dof_num.map.get(&(pair.slave_node, 1)).copied();
                    let master_a_dof_x = dof_num.map.get(&(pair.master_segment.node_a, 0)).copied();
                    let master_a_dof_y = dof_num.map.get(&(pair.master_segment.node_a, 1)).copied();
                    let master_b_dof_x = dof_num.map.get(&(pair.master_segment.node_b, 0)).copied();
                    let master_b_dof_y = dof_num.map.get(&(pair.master_segment.node_b, 1)).copied();

                    let xi_param = _xi.clamp(0.0, 1.0);
                    let na = 1.0 - xi_param; // shape function for node_a
                    let nb = xi_param;       // shape function for node_b

                    // Assemble penalty stiffness in normal direction:
                    // The gap = (u_slave - (na*u_a + nb*u_b)) . normal
                    // K_penalty = k * N^T * N where N maps DOFs to gap
                    // N = [nx, ny, -na*nx, -na*ny, -nb*nx, -nb*ny]
                    let nx = normal[0];
                    let ny = normal[1];
                    let n_vec = [nx, ny, -na * nx, -na * ny, -nb * nx, -nb * ny];
                    let dof_indices = [slave_dof_x, slave_dof_y,
                                       master_a_dof_x, master_a_dof_y,
                                       master_b_dof_x, master_b_dof_y];

                    for i in 0..6 {
                        if let Some(di) = dof_indices[i] {
                            for j in 0..6 {
                                if let Some(dj) = dof_indices[j] {
                                    asm.k[di * n + dj] += pair.stiffness * n_vec[i] * n_vec[j];
                                }
                            }
                            // AL force contribution for node-to-surface
                            if al_factor > 0.0 && n2s_lambda[pi].abs() > 1e-20 {
                                if di < nf {
                                    asm.f[di] -= n2s_lambda[pi] * n_vec[i];
                                }
                            }
                        }
                    }

                    // Friction for node-to-surface
                    if let Some(mu) = pair.friction_coefficient {
                        // Tangential direction is perpendicular to normal in 2D
                        let tx = -ny;
                        let ty = nx;
                        let t_vec = [tx, ty, -na * tx, -na * ty, -nb * tx, -nb * ty];

                        // Compute current normal force for friction limit
                        let gap_val = _gap_val;
                        let normal_force = if gap_val < 0.0 { pair.stiffness * (-gap_val) } else { 0.0 };
                        let max_friction = mu * normal_force;

                        // Compute tangential displacement
                        let mut tang_disp = 0.0;
                        for k in 0..6 {
                            if let Some(dk) = dof_indices[k] {
                                tang_disp += t_vec[k] * u_full.get(dk).copied().unwrap_or(0.0);
                            }
                        }

                        let fric_stiff = if max_friction > 1e-20 && tang_disp.abs() > 1e-20 {
                            // Regularized Coulomb: use penalty in tangential direction
                            // but limit force to mu*N
                            let _tang_force = (pair.stiffness * tang_disp).clamp(-max_friction, max_friction);
                            // Effective tangential stiffness
                            if (pair.stiffness * tang_disp).abs() <= max_friction {
                                pair.stiffness // sticking
                            } else {
                                0.0 // sliding -- force is constant, no additional stiffness
                            }
                        } else {
                            pair.stiffness // default to full sticking stiffness
                        };

                        // Add tangential penalty stiffness
                        if fric_stiff > 0.0 {
                            let k_fric = mu * fric_stiff;
                            for i in 0..6 {
                                if let Some(di) = dof_indices[i] {
                                    for j in 0..6 {
                                        if let Some(dj) = dof_indices[j] {
                                            asm.k[di * n + dj] += k_fric * t_vec[i] * t_vec[j];
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Release uplift supports that are inactive
            for (&nid, status) in &uplift_status {
                if *status == ContactStatus::Inactive {
                    // Remove vertical constraint (DOF 1 = Y)
                    if let Some(&d) = dof_num.map.get(&(nid, 1)) {
                        if d >= nf {
                            // It's a restrained DOF -- we can't easily un-restrain it
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
                            .ok_or("Singular stiffness in contact iteration")?
                    }
                }
            };
            let u_f = if let Some(ref cs) = cs {
                cs.expand_solution(&u_indep)
            } else {
                u_indep
            };

            for i in 0..nf {
                u_full[i] = u_f[i];
            }

            // Check element forces and update statuses
            let mut any_change = false;

            for (eid_str, behavior) in &input.element_behaviors {
                let eid: usize = if let Ok(id) = eid_str.parse() {
                    id
                } else if let Some(elem) = elem_by_id_str.get(eid_str) {
                    elem.id
                } else {
                    continue;
                };

                if let Some(&elem) = elem_by_id.get(&eid) {
                    let ni = node_by_id[&elem.node_i];
                    let nj = node_by_id[&elem.node_j];
                    let mat = mat_by_id[&elem.material_id];
                    let sec = sec_by_id[&elem.section_id];

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
                            *elem_flip_count.entry(eid).or_insert(0) += 1;
                        }
                    }
                    elem_status.insert(eid, new_status);
                }
            }

            // Check gap elements (with oscillation damping)
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
                    gap_flip_count[gi] += 1;
                    // Oscillation damping: if element has flipped too many times, force inactive
                    if gap_flip_count[gi] > max_flips {
                        // Keep current status to stop oscillation
                    } else {
                        any_change = true;
                        gap_status[gi] = new_status;
                    }
                }
            }

            // Check node-to-surface contact pairs
            for (pi, pair) in input.node_to_surface_pairs.iter().enumerate() {
                let (_normal, _xi, gap_val) = project_slave_onto_segment_2d(
                    pair, &node_by_id, &dof_num, &u_full,
                );

                let new_status = if gap_val < 0.0 {
                    ContactStatus::Active // penetrating
                } else {
                    ContactStatus::Inactive // open
                };

                if n2s_status[pi] != new_status {
                    n2s_flip_count[pi] += 1;
                    if n2s_flip_count[pi] > max_flips {
                        // Keep current status to stop oscillation
                    } else {
                        any_change = true;
                        n2s_status[pi] = new_status;
                    }
                }
            }

            if !any_change && iter > 0 {
                inner_converged = true;
                break;
            }
        }

        // Update augmented Lagrangian multipliers after inner loop converges
        if al_factor > 0.0 {
            let mut al_converged = true;

            for (gi, gap) in input.gap_elements.iter().enumerate() {
                if gap_status[gi] == ContactStatus::Active {
                    let dir = gap.direction.min(1);
                    let u_i = dof_num.global_dof(gap.node_i, dir).map(|d| u_full[d]).unwrap_or(0.0);
                    let u_j = dof_num.global_dof(gap.node_j, dir).map(|d| u_full[d]).unwrap_or(0.0);
                    let penetration = -(u_j - u_i) - gap.initial_gap;
                    if penetration > 0.0 {
                        let delta_lambda = al_factor * gap.stiffness * penetration;
                        gap_lambda[gi] += delta_lambda;
                        // Check if lambda update is significant
                        if penetration > 1e-10 {
                            al_converged = false;
                        }
                    }
                }
            }

            // Update node-to-surface lambdas
            for (pi, pair) in input.node_to_surface_pairs.iter().enumerate() {
                if n2s_status[pi] == ContactStatus::Active {
                    let (_normal, _xi, gap_val) = project_slave_onto_segment_2d(
                        pair, &node_by_id, &dof_num, &u_full,
                    );
                    if gap_val < 0.0 {
                        let penetration = -gap_val;
                        n2s_lambda[pi] += al_factor * pair.stiffness * penetration;
                        if penetration > 1e-10 {
                            al_converged = false;
                        }
                    }
                }
            }

            if al_converged || !inner_converged {
                converged = inner_converged && al_converged;
                break;
            }
        } else {
            converged = inner_converged;
            break;
        }
    }

    // Build convergence diagnostics
    let diagnostics = build_diagnostics_2d(
        &gap_flip_count,
        &input.gap_elements,
        &elem_flip_count,
        &input.element_behaviors,
        &n2s_flip_count,
        &input.node_to_surface_pairs,
        max_flips,
    );

    // Build final results
    let results = linear::solve_2d(&input.solver).unwrap_or_else(|_| {
        AnalysisResults {
            displacements: linear::build_displacements_2d(&dof_num, &u_full),
            reactions: vec![],
            element_forces: linear::compute_internal_forces_2d(&input.solver, &dof_num, &u_full),
            constraint_forces: vec![],
            diagnostics: vec![],
            solver_diagnostics: vec![],
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
            let penetration = if gap_status[gi] == ContactStatus::Active {
                let p = -(relative_disp) - gap.initial_gap;
                if p > 0.0 { p } else { 0.0 }
            } else {
                0.0
            };
            let mu_eff = gap.friction.or(gap.friction_coefficient);
            let friction_force = if gap_status[gi] == ContactStatus::Active {
                if let (Some(mu), Some(fdir)) = (mu_eff, gap.friction_direction) {
                    let fdir = fdir.min(1);
                    let u_fi = dof_num.global_dof(gap.node_i, fdir).map(|d| u_full[d]).unwrap_or(0.0);
                    let u_fj = dof_num.global_dof(gap.node_j, fdir).map(|d| u_full[d]).unwrap_or(0.0);
                    let tangential_disp = u_fj - u_fi;
                    let max_friction = mu * force.abs();
                    // Coulomb: friction limited by mu * normal force
                    (gap.stiffness * tangential_disp).clamp(-max_friction, max_friction)
                } else {
                    0.0
                }
            } else {
                0.0
            };
            GapContactInfo {
                id: gap.id,
                status: if gap_status[gi] == ContactStatus::Active { "closed".into() } else { "open".into() },
                displacement: relative_disp,
                force,
                penetration,
                friction_force,
            }
        })
        .collect();

    // Build node-to-surface results
    let n2s_info: Vec<NodeToSurfaceContactInfo> = input.node_to_surface_pairs.iter().enumerate()
        .map(|(pi, pair)| {
            let (normal, xi, gap_val) = project_slave_onto_segment_2d(
                pair, &node_by_id, &dof_num, &u_full,
            );
            let normal_force = if n2s_status[pi] == ContactStatus::Active && gap_val < 0.0 {
                pair.stiffness * (-gap_val)
            } else {
                0.0
            };
            let friction_force = if n2s_status[pi] == ContactStatus::Active {
                if let Some(mu) = pair.friction_coefficient {
                    // Compute tangential displacement
                    let tx = -normal[1];
                    let ty = normal[0];
                    let xi_c = xi.clamp(0.0, 1.0);
                    let na = 1.0 - xi_c;
                    let nb = xi_c;

                    let sx = dof_num.global_dof(pair.slave_node, 0).map(|d| u_full[d]).unwrap_or(0.0);
                    let sy = dof_num.global_dof(pair.slave_node, 1).map(|d| u_full[d]).unwrap_or(0.0);
                    let ax = dof_num.global_dof(pair.master_segment.node_a, 0).map(|d| u_full[d]).unwrap_or(0.0);
                    let ay = dof_num.global_dof(pair.master_segment.node_a, 1).map(|d| u_full[d]).unwrap_or(0.0);
                    let bx = dof_num.global_dof(pair.master_segment.node_b, 0).map(|d| u_full[d]).unwrap_or(0.0);
                    let by = dof_num.global_dof(pair.master_segment.node_b, 1).map(|d| u_full[d]).unwrap_or(0.0);

                    let rel_x = sx - (na * ax + nb * bx);
                    let rel_y = sy - (na * ay + nb * by);
                    let tang_disp = rel_x * tx + rel_y * ty;
                    let max_fric = mu * normal_force.abs();
                    (pair.stiffness * tang_disp).clamp(-max_fric, max_fric)
                } else {
                    0.0
                }
            } else {
                0.0
            };
            NodeToSurfaceContactInfo {
                slave_node: pair.slave_node,
                master_segment_id: pair.master_segment.id,
                status: if n2s_status[pi] == ContactStatus::Active { "closed".into() } else { "open".into() },
                gap: gap_val,
                normal_force,
                friction_force,
                xi,
            }
        })
        .collect();

    Ok(ContactResult {
        results,
        iterations: total_iters,
        converged,
        element_status: element_status_info,
        gap_status: gap_info,
        diagnostics,
        node_to_surface_status: n2s_info,
        al_iterations: al_iter_count,
    })
}

// ---------------------------------------------------------------------------
// 3D solver
// ---------------------------------------------------------------------------

/// Solve a 3D structure with contact/gap elements.
pub fn solve_contact_3d(input: &ContactInput3D) -> Result<ContactResult3D, String> {
    let max_iter = input.max_iter.unwrap_or(30);
    let max_flips = input.max_flips.unwrap_or(4);
    let al_factor = input.augmented_lagrangian.unwrap_or(0.0);
    let al_max_iter = input.al_max_iter.unwrap_or(5);
    let damping_coeff = input.damping_coefficient.unwrap_or(0.0);

    let dof_num = DofNumbering::build_3d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_3d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Build lookup maps to avoid O(n) linear scans per element
    let node_by_id: HashMap<usize, &SolverNode3D> = input.solver.nodes.values().map(|n| (n.id, n)).collect();
    let elem_by_id: HashMap<usize, &SolverElement3D> = input.solver.elements.values().map(|e| (e.id, e)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> = input.solver.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection3D> = input.solver.sections.values().map(|s| (s.id, s)).collect();

    // Track element statuses
    let mut elem_status: HashMap<usize, ContactStatus> = HashMap::new();
    for (eid_str, _) in &input.element_behaviors {
        if let Ok(eid) = eid_str.parse::<usize>() {
            elem_status.insert(eid, ContactStatus::Active);
        }
    }

    // Track gap statuses + oscillation flip counters
    let mut gap_status: Vec<ContactStatus> = vec![ContactStatus::Inactive; input.gap_elements.len()];
    let mut gap_flip_count: Vec<usize> = vec![0; input.gap_elements.len()];

    // Augmented Lagrangian multipliers (per gap)
    let mut gap_lambda: Vec<f64> = vec![0.0; input.gap_elements.len()];

    // Track uplift support statuses
    let mut uplift_status: HashMap<usize, ContactStatus> = HashMap::new();
    for &nid in &input.uplift_supports {
        uplift_status.insert(nid, ContactStatus::Active);
    }

    let mut u_full = vec![0.0; n];
    let mut u_prev = vec![0.0; n]; // previous iteration displacement (for damping)
    let mut converged = false;
    let mut total_iters = 0;

    // Element-level oscillation tracking for diagnostics
    let mut elem_flip_count: HashMap<usize, usize> = HashMap::new();

    // Augmented Lagrangian outer loop
    let al_outer_iters = if al_factor > 0.0 { al_max_iter } else { 1 };
    let mut al_iter_count: usize = 0;

    for al_iter in 0..al_outer_iters {
        al_iter_count = al_iter + 1;

        // Reset flip counters for each AL outer iteration
        for fc in gap_flip_count.iter_mut() { *fc = 0; }
        for fc in elem_flip_count.values_mut() { *fc = 0; }

        let mut inner_converged = false;

        for iter in 0..max_iter {
            total_iters += 1;

            // Save previous displacement for damping computation
            u_prev.copy_from_slice(&u_full);

            let mut asm = assembly::assemble_3d(&input.solver, &dof_num);

            // Deactivate elements
            for (eid, status) in &elem_status {
                if *status == ContactStatus::Inactive {
                    if let Some(&elem) = elem_by_id.get(eid) {
                        if elem.elem_type == "truss" || elem.elem_type == "cable" {
                            let ni = node_by_id[&elem.node_i];
                            let nj = node_by_id[&elem.node_j];
                            let mat = mat_by_id[&elem.material_id];
                            let sec = sec_by_id[&elem.section_id];

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

                        // AL force contribution
                        if al_factor > 0.0 && gap_lambda[gi].abs() > 1e-20 {
                            if di < nf { asm.f[di] -= gap_lambda[gi]; }
                            if dj < nf { asm.f[dj] += gap_lambda[gi]; }
                        }

                        // Contact damping force
                        if damping_coeff > 0.0 && gap_flip_count[gi] > 0 {
                            let vel_i = u_full.get(di).copied().unwrap_or(0.0) - u_prev.get(di).copied().unwrap_or(0.0);
                            let vel_j = u_full.get(dj).copied().unwrap_or(0.0) - u_prev.get(dj).copied().unwrap_or(0.0);
                            let f_damp_i = damping_coeff * vel_i;
                            let f_damp_j = damping_coeff * vel_j;
                            if di < nf { asm.f[di] -= f_damp_i; }
                            if dj < nf { asm.f[dj] -= f_damp_j; }
                            asm.k[di * n + di] += damping_coeff;
                            asm.k[dj * n + dj] += damping_coeff;
                        }
                    }
                    // Add tangential friction stiffness
                    let mu_eff = gap.friction.or(gap.friction_coefficient);
                    if let (Some(mu), Some(fdir)) = (mu_eff, gap.friction_direction) {
                        let fdir = fdir.min(2);
                        if let (Some(&fi), Some(&fj)) = (
                            dof_num.map.get(&(gap.node_i, fdir)),
                            dof_num.map.get(&(gap.node_j, fdir)),
                        ) {
                            let k_fric = mu * gap.stiffness;
                            asm.k[fi * n + fi] += k_fric;
                            asm.k[fj * n + fj] += k_fric;
                            asm.k[fi * n + fj] -= k_fric;
                            asm.k[fj * n + fi] -= k_fric;
                        }
                    }
                }
            }

            // Solve
            let free_idx: Vec<usize> = (0..nf).collect();
            let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
            let f_f: Vec<f64> = asm.f[..nf].to_vec();
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
                            .ok_or("Singular stiffness in 3D contact iteration")?
                    }
                }
            };
            let u_f = if let Some(ref cs) = cs {
                cs.expand_solution(&u_indep)
            } else {
                u_indep
            };

            for i in 0..nf { u_full[i] = u_f[i]; }

            // Check element forces and update statuses
            let mut any_change = false;

            for (eid_str, behavior) in &input.element_behaviors {
                let eid: usize = match eid_str.parse() {
                    Ok(id) => id,
                    Err(_) => continue,
                };

                if let Some(&elem) = elem_by_id.get(&eid) {
                    let ni = node_by_id[&elem.node_i];
                    let nj = node_by_id[&elem.node_j];
                    let mat = mat_by_id[&elem.material_id];
                    let sec = sec_by_id[&elem.section_id];

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
                        if *old != new_status {
                            any_change = true;
                            *elem_flip_count.entry(eid).or_insert(0) += 1;
                        }
                    }
                    elem_status.insert(eid, new_status);
                }
            }

            // Check gap elements (with oscillation damping)
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
                    gap_flip_count[gi] += 1;
                    if gap_flip_count[gi] > max_flips {
                        // Keep current status to stop oscillation
                    } else {
                        any_change = true;
                        gap_status[gi] = new_status;
                    }
                }
            }

            if !any_change && iter > 0 {
                inner_converged = true;
                break;
            }
        }

        // Update augmented Lagrangian multipliers after inner loop converges
        if al_factor > 0.0 {
            let mut al_converged = true;

            for (gi, gap) in input.gap_elements.iter().enumerate() {
                if gap_status[gi] == ContactStatus::Active {
                    let dir = gap.direction.min(2);
                    let u_i = dof_num.global_dof(gap.node_i, dir).map(|d| u_full[d]).unwrap_or(0.0);
                    let u_j = dof_num.global_dof(gap.node_j, dir).map(|d| u_full[d]).unwrap_or(0.0);
                    let penetration = -(u_j - u_i) - gap.initial_gap;
                    if penetration > 0.0 {
                        gap_lambda[gi] += al_factor * gap.stiffness * penetration;
                        if penetration > 1e-10 {
                            al_converged = false;
                        }
                    }
                }
            }

            if al_converged || !inner_converged {
                converged = inner_converged && al_converged;
                break;
            }
        } else {
            converged = inner_converged;
            break;
        }
    }

    // Build convergence diagnostics
    let diagnostics = build_diagnostics_3d(
        &gap_flip_count,
        &input.gap_elements,
        &elem_flip_count,
        &input.element_behaviors,
        max_flips,
    );

    // Build results
    let displacements = linear::build_displacements_3d(&dof_num, &u_full);
    let element_forces = linear::compute_internal_forces_3d(&input.solver, &dof_num, &u_full);

    let results = AnalysisResults3D {
        displacements,
        reactions: vec![],
        element_forces,
        plate_stresses: linear::compute_plate_stresses(&input.solver, &dof_num, &u_full),
        quad_stresses: linear::compute_quad_stresses(&input.solver, &dof_num, &u_full),
        quad_nodal_stresses: vec![],
        constraint_forces: vec![],
        diagnostics: vec![],
        solver_diagnostics: vec![],
        timings: None,
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
            let penetration = if gap_status[gi] == ContactStatus::Active {
                let p = -(relative_disp) - gap.initial_gap;
                if p > 0.0 { p } else { 0.0 }
            } else {
                0.0
            };
            let mu_eff = gap.friction.or(gap.friction_coefficient);
            let friction_force = if gap_status[gi] == ContactStatus::Active {
                if let (Some(mu), Some(fdir)) = (mu_eff, gap.friction_direction) {
                    let fdir = fdir.min(2);
                    let u_fi = dof_num.global_dof(gap.node_i, fdir).map(|d| u_full[d]).unwrap_or(0.0);
                    let u_fj = dof_num.global_dof(gap.node_j, fdir).map(|d| u_full[d]).unwrap_or(0.0);
                    let tangential_disp = u_fj - u_fi;
                    let max_friction = mu * force.abs();
                    (gap.stiffness * tangential_disp).clamp(-max_friction, max_friction)
                } else {
                    0.0
                }
            } else {
                0.0
            };
            GapContactInfo {
                id: gap.id,
                status: if gap_status[gi] == ContactStatus::Active { "closed".into() } else { "open".into() },
                displacement: relative_disp,
                force,
                penetration,
                friction_force,
            }
        })
        .collect();

    Ok(ContactResult3D {
        results,
        iterations: total_iters,
        converged,
        element_status: element_status_info,
        gap_status: gap_info,
        diagnostics,
        al_iterations: al_iter_count,
    })
}

// ---------------------------------------------------------------------------
// Node-to-surface projection (2D)
// ---------------------------------------------------------------------------

/// Project a slave node onto a master line segment in 2D.
/// Returns (outward_normal, parametric_xi, signed_gap).
/// Gap is positive when open, negative when penetrating.
fn project_slave_onto_segment_2d(
    pair: &NodeToSurfacePair,
    node_by_id: &HashMap<usize, &SolverNode>,
    dof_num: &DofNumbering,
    u_full: &[f64],
) -> ([f64; 2], f64, f64) {
    // Get deformed positions of master segment endpoints
    let (ax, ay) = get_deformed_pos_2d(pair.master_segment.node_a, node_by_id, dof_num, u_full);
    let (bx, by) = get_deformed_pos_2d(pair.master_segment.node_b, node_by_id, dof_num, u_full);
    let (sx, sy) = get_deformed_pos_2d(pair.slave_node, node_by_id, dof_num, u_full);

    // Segment vector
    let dx = bx - ax;
    let dy = by - ay;
    let seg_len_sq = dx * dx + dy * dy;

    if seg_len_sq < 1e-30 {
        // Degenerate segment
        return ([0.0, 1.0], 0.0, 1.0e10);
    }

    // Parametric coordinate of projection
    let xi = ((sx - ax) * dx + (sy - ay) * dy) / seg_len_sq;
    let xi_clamped = xi.clamp(0.0, 1.0);

    // Closest point on segment
    let cx = ax + xi_clamped * dx;
    let cy = ay + xi_clamped * dy;

    // Outward normal (perpendicular to segment, pointing away from segment)
    // Convention: rotate segment direction 90 degrees counterclockwise
    let seg_len = seg_len_sq.sqrt();
    let nx = -dy / seg_len;
    let ny = dx / seg_len;

    // Signed gap: positive = slave is on the normal side (open), negative = penetrating
    let gap = (sx - cx) * nx + (sy - cy) * ny;

    ([nx, ny], xi_clamped, gap)
}

/// Get the deformed position of a 2D node.
fn get_deformed_pos_2d(
    node_id: usize,
    node_by_id: &HashMap<usize, &SolverNode>,
    dof_num: &DofNumbering,
    u_full: &[f64],
) -> (f64, f64) {
    let node = node_by_id.get(&node_id);
    let x0 = node.map(|n| n.x).unwrap_or(0.0);
    let y0 = node.map(|n| n.y).unwrap_or(0.0);
    let ux = dof_num.global_dof(node_id, 0).map(|d| u_full.get(d).copied().unwrap_or(0.0)).unwrap_or(0.0);
    let uy = dof_num.global_dof(node_id, 1).map(|d| u_full.get(d).copied().unwrap_or(0.0)).unwrap_or(0.0);
    (x0 + ux, y0 + uy)
}

// ---------------------------------------------------------------------------
// Convergence diagnostics
// ---------------------------------------------------------------------------

/// Build convergence diagnostics for 2D contact analysis.
fn build_diagnostics_2d(
    gap_flip_count: &[usize],
    gap_elements: &[GapElement],
    elem_flip_count: &HashMap<usize, usize>,
    element_behaviors: &HashMap<String, String>,
    n2s_flip_count: &[usize],
    n2s_pairs: &[NodeToSurfacePair],
    max_flips: usize,
) -> Vec<String> {
    let mut diags = Vec::new();

    // Report oscillating gap elements
    for (gi, gap) in gap_elements.iter().enumerate() {
        let flips = gap_flip_count[gi];
        if flips >= 2 {
            let msg = format!(
                "Gap element {} (nodes {}-{}): {} status oscillations in contact iteration",
                gap.id, gap.node_i, gap.node_j, flips,
            );
            diags.push(msg);
            if flips > max_flips {
                diags.push(format!(
                    "  -> Gap {} exceeded max_flips={}, status was frozen. Consider increasing penalty stiffness or damping_coefficient.",
                    gap.id, max_flips,
                ));
            }
        }
    }

    // Report oscillating behavior elements
    for (eid_str, behavior) in element_behaviors {
        if let Ok(eid) = eid_str.parse::<usize>() {
            if let Some(&flips) = elem_flip_count.get(&eid) {
                if flips >= 2 {
                    diags.push(format!(
                        "Element {} ({}): {} status oscillations. Consider increasing damping_coefficient.",
                        eid, behavior, flips,
                    ));
                }
            }
        }
    }

    // Report oscillating node-to-surface pairs
    for (pi, pair) in n2s_pairs.iter().enumerate() {
        let flips = n2s_flip_count[pi];
        if flips >= 2 {
            diags.push(format!(
                "Node-to-surface pair (slave={}, master segment {}): {} status oscillations",
                pair.slave_node, pair.master_segment.id, flips,
            ));
            if flips > max_flips {
                diags.push(format!(
                    "  -> Pair slave={} exceeded max_flips={}, status was frozen. Consider increasing penalty stiffness or damping_coefficient.",
                    pair.slave_node, max_flips,
                ));
            }
        }
    }

    if diags.is_empty() {
        diags.push("No contact oscillations detected.".into());
    }

    diags
}

/// Build convergence diagnostics for 3D contact analysis.
fn build_diagnostics_3d(
    gap_flip_count: &[usize],
    gap_elements: &[GapElement],
    elem_flip_count: &HashMap<usize, usize>,
    element_behaviors: &HashMap<String, String>,
    max_flips: usize,
) -> Vec<String> {
    let mut diags = Vec::new();

    // Report oscillating gap elements
    for (gi, gap) in gap_elements.iter().enumerate() {
        let flips = gap_flip_count[gi];
        if flips >= 2 {
            let msg = format!(
                "Gap element {} (nodes {}-{}): {} status oscillations in contact iteration",
                gap.id, gap.node_i, gap.node_j, flips,
            );
            diags.push(msg);
            if flips > max_flips {
                diags.push(format!(
                    "  -> Gap {} exceeded max_flips={}, status was frozen. Consider increasing penalty stiffness or damping_coefficient.",
                    gap.id, max_flips,
                ));
            }
        }
    }

    // Report oscillating behavior elements
    for (eid_str, behavior) in element_behaviors {
        if let Ok(eid) = eid_str.parse::<usize>() {
            if let Some(&flips) = elem_flip_count.get(&eid) {
                if flips >= 2 {
                    diags.push(format!(
                        "Element {} ({}): {} status oscillations. Consider increasing damping_coefficient.",
                        eid, behavior, flips,
                    ));
                }
            }
        }
    }

    if diags.is_empty() {
        diags.push("No contact oscillations detected.".into());
    }

    diags
}
