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
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly;
use super::linear;
use super::constraints::FreeConstraintSystem;
use super::sparse_tangent::{
    solve_tangent_sparse, tangent_free_sparse_triplets, SparseSymbolicCache,
};

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

/// One contribution of the contact state to the system: a stiffness block
/// `k` (row-major m×m) and a load `f` (length m) on the model DOFs `dofs`.
/// Built in global axes and rotated into the inclined-support frames K is
/// numbered in before it is added.
struct Correction {
    dofs: Vec<usize>,
    k: Vec<f64>,
    f: Vec<f64>,
}

impl Correction {
    /// Position of `dof` in the block, appending it (zero row, column and
    /// load) when absent.
    fn slot(&mut self, dof: usize) -> usize {
        if let Some(p) = self.dofs.iter().position(|&d| d == dof) {
            return p;
        }
        let m = self.dofs.len();
        let mut k = vec![0.0; (m + 1) * (m + 1)];
        for a in 0..m {
            for b in 0..m {
                k[a * (m + 1) + b] = self.k[a * m + b];
            }
        }
        self.k = k;
        self.dofs.push(dof);
        self.f.push(0.0);
        m
    }

    /// k ← T·k·Tᵀ and f ← T·f with T the rotation `r` (rows = frame axes)
    /// on the translational DOFs `frame` of one inclined support. A block on
    /// some of those DOFs is first widened to all of them, since the
    /// rotation mixes them.
    fn rotate<const D: usize>(&mut self, frame: &[usize; D], r: &[[f64; D]; D]) {
        if !self.dofs.iter().any(|d| frame.contains(d)) {
            return;
        }
        let p: [usize; D] = std::array::from_fn(|a| self.slot(frame[a]));
        let m = self.dofs.len();
        for c in 0..m {
            let v: [f64; D] = std::array::from_fn(|a| self.k[p[a] * m + c]);
            for a in 0..D {
                self.k[p[a] * m + c] = (0..D).map(|b| r[a][b] * v[b]).sum();
            }
        }
        for row in 0..m {
            let v: [f64; D] = std::array::from_fn(|a| self.k[row * m + p[a]]);
            for a in 0..D {
                self.k[row * m + p[a]] = (0..D).map(|b| r[a][b] * v[b]).sum();
            }
        }
        let v: [f64; D] = std::array::from_fn(|a| self.f[p[a]]);
        for a in 0..D {
            self.f[p[a]] = (0..D).map(|b| r[a][b] * v[b]).sum();
        }
    }

    /// Into the 2D inclined-roller frames K is numbered in.
    fn rotated(mut self, its: &[assembly::InclinedTransformData2D]) -> Self {
        for it in its {
            self.rotate(&it.dofs, &it.r);
        }
        self
    }

    /// Into the 3D inclined-support frames K is numbered in.
    fn rotated_3d(mut self, its: &[assembly::InclinedTransformData]) -> Self {
        for it in its {
            self.rotate(&it.dofs, &it.r);
        }
        self
    }
}

/// The stiffness of the model with the deactivated members taken out, in
/// the inclined-support frames: dense n×n below the sparse threshold, the
/// full lower-triangle CSC above it.
enum BaseStiffness {
    Dense(Vec<f64>),
    Sparse(CscMatrix),
}

impl BaseStiffness {
    /// Assemble with the linear solver's own assembler on the model minus
    /// `inactive`, so a slack member is gone exactly as if it had not been
    /// drawn (and the orphan-rotation guard sees the model it solves).
    fn build(
        input: &SolverInput,
        inactive: &[usize],
        dof_num: &DofNumbering,
        sparse: bool,
    ) -> (Self, Vec<assembly::InclinedTransformData2D>) {
        let reduced;
        let model = if inactive.is_empty() {
            input
        } else {
            let mut m = input.clone();
            m.elements.retain(|_, e| !inactive.contains(&e.id));
            reduced = m;
            &reduced
        };
        if sparse {
            let a = super::sparse_assembly::assemble_stiffness_sparse_2d(model, dof_num);
            (BaseStiffness::Sparse(a.k_full), a.inclined_transforms_2d)
        } else {
            let a = assembly::assemble_stiffness_2d(model, dof_num);
            (BaseStiffness::Dense(a.k), a.inclined_transforms_2d)
        }
    }

    /// As `build`, for a 3D model (curved beams already expanded).
    fn build_3d(input: &SolverInput3D, inactive: &[usize], dof_num: &DofNumbering, sparse: bool) -> Self {
        let reduced;
        let model = if inactive.is_empty() {
            input
        } else {
            let mut m = input.clone();
            m.elements.retain(|_, e| !inactive.contains(&e.id));
            reduced = m;
            &reduced
        };
        if sparse {
            let a = assembly::assemble_stiffness_sparse_3d(model, dof_num, true);
            BaseStiffness::Sparse(a.k_full.expect("k_full requested"))
        } else {
            BaseStiffness::Dense(assembly::assemble_stiffness_3d(model, dof_num).k)
        }
    }

    /// K·u over all DOFs.
    fn mul(&self, u: &[f64]) -> Vec<f64> {
        match self {
            BaseStiffness::Dense(k) => {
                let n = u.len();
                (0..n).map(|i| (0..n).map(|j| k[i * n + j] * u[j]).sum()).collect()
            }
            BaseStiffness::Sparse(k) => k.sym_mat_vec(u),
        }
    }
}

/// Solve the free DOFs of (K_base + Σ corrections)·u = f + Σ f_corr with
/// the restrained DOFs held at `u_r`; returns u over all DOFs, in the
/// inclined-support frames.
#[allow(clippy::too_many_arguments)]
fn solve_contact_state(
    base: &BaseStiffness,
    corrections: &[Correction],
    f_base: &[f64],
    u_r: &[f64],
    nf: usize,
    cs: &Option<FreeConstraintSystem>,
    sparse_sym_cache: &mut Option<SparseSymbolicCache>,
) -> Result<Vec<f64>, String> {
    let n = f_base.len();
    let mut u0 = vec![0.0; n];
    u0[nf..].copy_from_slice(u_r);
    // f_f − K_fr·u_r, with the corrections' share of both.
    let mut rhs: Vec<f64> = f_base[..nf].to_vec();
    if u_r.iter().any(|v| *v != 0.0) {
        let ku0 = base.mul(&u0);
        for i in 0..nf {
            rhs[i] -= ku0[i];
        }
    }
    for c in corrections {
        let m = c.dofs.len();
        for a in 0..m {
            let da = c.dofs[a];
            if da >= nf {
                continue;
            }
            rhs[da] += c.f[a];
            for b in 0..m {
                rhs[da] -= c.k[a * m + b] * u0[c.dofs[b]];
            }
        }
    }
    let rhs_s = match cs {
        Some(cs) => cs.reduce_vector(&rhs),
        None => rhs,
    };
    let u_indep = match base {
        BaseStiffness::Sparse(k_full) => {
            let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
            for j in 0..nf {
                for p in k_full.col_ptr[j]..k_full.col_ptr[j + 1] {
                    let i = k_full.row_idx[p];
                    if i < nf {
                        rows.push(i);
                        cols.push(j);
                        vals.push(k_full.values[p]);
                    }
                }
            }
            for c in corrections {
                let m = c.dofs.len();
                for a in 0..m {
                    for b in 0..m {
                        let (i, j) = (c.dofs[a], c.dofs[b]);
                        if i < nf && j <= i {
                            rows.push(i);
                            cols.push(j);
                            vals.push(c.k[a * m + b]);
                        }
                    }
                }
            }
            let k_s = tangent_free_sparse_triplets(&rows, &cols, &vals, nf, cs);
            solve_tangent_sparse(&k_s, &rhs_s, sparse_sym_cache)?
        }
        BaseStiffness::Dense(k) => {
            let mut k_ff = vec![0.0; nf * nf];
            for i in 0..nf {
                k_ff[i * nf..(i + 1) * nf].copy_from_slice(&k[i * n..i * n + nf]);
            }
            for c in corrections {
                let m = c.dofs.len();
                for a in 0..m {
                    for b in 0..m {
                        let (i, j) = (c.dofs[a], c.dofs[b]);
                        if i < nf && j < nf {
                            k_ff[i * nf + j] += c.k[a * m + b];
                        }
                    }
                }
            }
            let k_s = match cs {
                Some(cs) => cs.reduce_matrix(&k_ff),
                None => k_ff,
            };
            let ns = rhs_s.len();
            let mut k_work = k_s.clone();
            match cholesky_solve(&mut k_work, &rhs_s, ns) {
                Some(u) => u,
                None => {
                    let mut k_work = k_s;
                    let mut f_work = rhs_s;
                    lu_solve(&mut k_work, &mut f_work, ns).ok_or("Singular stiffness in contact iteration")?
                }
            }
        }
    };
    let u_f = match cs {
        Some(cs) => cs.expand_solution(&u_indep),
        None => u_indep,
    };
    if u_f.iter().any(|v| !v.is_finite()) {
        return Err("Singular stiffness in contact iteration".into());
    }
    let mut u = u0;
    u[..nf].copy_from_slice(&u_f[..nf]);
    Ok(u)
}

/// The contact state of a 2D model.
struct ContactState2D {
    elem: HashMap<usize, ContactStatus>,
    gap: Vec<ContactStatus>,
    gap_lambda: Vec<f64>,
    gap_flips: Vec<usize>,
    /// Friction state of a closed contact: 0 sticking, ±1 sliding with the
    /// sign of the tangential slip.
    gap_slip: Vec<f64>,
    n2s: Vec<ContactStatus>,
    n2s_lambda: Vec<f64>,
    n2s_slip: Vec<f64>,
}

/// The corrections the current contact state adds to the model, in the
/// inclined-support frames: closed gaps (penalty spring acting from the
/// moment the gap closes, augmented-Lagrangian force, friction), closed
/// node-to-surface pairs (the same along the segment normal), and, when
/// `damping` is set, the proximal term c·(u − u_cur) on oscillating gaps
/// (which vanishes at a fixed point and is never in the final solve).
#[allow(clippy::too_many_arguments)]
fn contact_corrections_2d(
    input: &ContactInput,
    st: &ContactState2D,
    node_by_id: &HashMap<usize, &SolverNode>,
    dof_num: &DofNumbering,
    u_cur: &[f64],
    damping: Option<f64>,
    al: bool,
    its: &[assembly::InclinedTransformData2D],
) -> Vec<Correction> {
    let mut out = Vec::new();
    let pair = |k: f64| vec![k, -k, -k, k];
    for (gi, gap) in input.gap_elements.iter().enumerate() {
        if st.gap[gi] != ContactStatus::Active {
            continue;
        }
        let dir = gap.direction.min(1); // 2D: 0=X, 1=Z
        if let (Some(&di), Some(&dj)) = (dof_num.map.get(&(gap.node_i, dir)), dof_num.map.get(&(gap.node_j, dir))) {
            // Closed gap: force k·(u_i − u_j − g0) pushing the ends apart, so
            // K gets k on the pair and f gets the k·g0 the spring is
            // pre-shortened by (plus the multiplier λ under AL).
            let k = gap.stiffness;
            let mut push = k * gap.initial_gap;
            if al {
                push -= st.gap_lambda[gi];
            }
            let mut c = Correction { dofs: vec![di, dj], k: pair(k), f: vec![push, -push] };
            if let Some(cd) = damping.filter(|_| st.gap_flips[gi] > 0) {
                c.k[0] += cd;
                c.k[3] += cd;
                c.f[0] += cd * u_cur[di];
                c.f[1] += cd * u_cur[dj];
            }
            out.push(c);
        }
        if let (Some(mu), Some(fdir)) = (gap.friction.or(gap.friction_coefficient), gap.friction_direction) {
            let fdir = fdir.min(1);
            if let (Some(&fi), Some(&fj)) = (dof_num.map.get(&(gap.node_i, fdir)), dof_num.map.get(&(gap.node_j, fdir))) {
                // Sticking: tangential spring μ·k. Sliding: the Coulomb force
                // μ·N against the slip, with N from the current iterate.
                let s = st.gap_slip[gi];
                if s == 0.0 {
                    out.push(Correction { dofs: vec![fi, fj], k: pair(mu * gap.stiffness), f: vec![0.0, 0.0] });
                } else {
                    let fr = s * mu * gap_normal_force_2d(gap, st.gap_lambda[gi], al, dof_num, u_cur);
                    out.push(Correction { dofs: vec![fi, fj], k: vec![0.0; 4], f: vec![fr, -fr] });
                }
            }
        }
    }
    for (pi, p) in input.node_to_surface_pairs.iter().enumerate() {
        if st.n2s[pi] != ContactStatus::Active {
            continue;
        }
        let (normal, xi, _) = project_slave_onto_segment_2d(p, node_by_id, dof_num, u_cur);
        let (na, nb) = (1.0 - xi, xi);
        let ends = [(p.slave_node, 1.0), (p.master_segment.node_a, -na), (p.master_segment.node_b, -nb)];
        let mut dofs = Vec::new();
        let mut nv = Vec::new();
        let mut tv = Vec::new();
        // Gap of the undeformed geometry along this normal: the linearised
        // gap is g0 + N·u, and the penalty k·N·Nᵀ acts on it, so f carries
        // −k·g0·N (and −λ·N under AL).
        let mut g0 = 0.0;
        for (node, w) in ends {
            let (x, z) = node_by_id.get(&node).map_or((0.0, 0.0), |nd| (nd.x, nd.z));
            g0 += w * (x * normal[0] + z * normal[1]);
            for (ldof, nn, tt) in [(0, normal[0], -normal[1]), (1, normal[1], normal[0])] {
                if let Some(&d) = dof_num.map.get(&(node, ldof)) {
                    dofs.push(d);
                    nv.push(w * nn);
                    tv.push(w * tt);
                }
            }
        }
        let m = dofs.len();
        let k = p.stiffness;
        let mut lam = k * g0;
        if al {
            lam += st.n2s_lambda[pi];
        }
        let mut kk = vec![0.0; m * m];
        for a in 0..m {
            for b in 0..m {
                kk[a * m + b] = k * nv[a] * nv[b];
            }
        }
        let mut f: Vec<f64> = nv.iter().map(|n| -lam * n).collect();
        if let Some(mu) = p.friction_coefficient {
            // Sticking: tangential spring μ·k. Sliding: the Coulomb force
            // μ·N against the slip, N from the current iterate.
            let s = st.n2s_slip[pi];
            if s == 0.0 {
                for a in 0..m {
                    for b in 0..m {
                        kk[a * m + b] += mu * k * tv[a] * tv[b];
                    }
                }
            } else {
                let normal_force = n2s_normal_force_2d(p, st.n2s_lambda[pi], al, node_by_id, dof_num, u_cur);
                for a in 0..m {
                    f[a] -= s * mu * normal_force * tv[a];
                }
            }
        }
        out.push(Correction { dofs, k: kk, f });
    }
    out.into_iter().map(|c| c.rotated(its)).collect()
}

/// Uplift (compression-only) supports: an outer loop over which of them
/// are lifted off. A lifted support is solved without its vertical restraint
/// (pinned → rollerZ, fixed → guidedZ, rollerX → none); a support whose
/// vertical reaction comes out tensile lifts off, a lifted one whose node
/// comes back below its seat bears again. Each state is an ordinary contact
/// solve of that model.
fn solve_uplift_2d(input: &ContactInput) -> Result<ContactResult, String> {
    let mut uplift: Vec<usize> = input.uplift_supports.clone();
    uplift.sort_unstable();
    uplift.dedup();
    for &nid in &uplift {
        let sup = input
            .solver
            .supports
            .values()
            .find(|s| s.node_id == nid)
            .ok_or_else(|| format!("Contact analysis: uplift support at node {nid}, which has no support"))?;
        if !matches!(sup.support_type.as_str(), "pinned" | "fixed" | "rollerX") {
            return Err(format!(
                "Contact analysis supports uplift only on pinned, fixed and rollerX supports (node {nid} is {}).",
                sup.support_type
            ));
        }
        if sup.dz.is_some_and(|v| v != 0.0) {
            return Err(format!("Contact analysis: uplift support at node {nid} has a prescribed vertical displacement."));
        }
    }
    let max_outer = input.max_iter.unwrap_or(30);
    let mut lifted: Vec<usize> = Vec::new();
    let mut total_iters = 0;
    let mut flips: HashMap<usize, usize> = HashMap::new();
    for _ in 0..max_outer {
        let mut model = input.clone();
        model.uplift_supports.clear();
        model.solver.supports.retain(|_, s| !(lifted.contains(&s.node_id) && s.support_type == "rollerX"));
        for s in model.solver.supports.values_mut() {
            if lifted.contains(&s.node_id) {
                s.support_type = if s.support_type == "fixed" { "guidedZ".into() } else { "rollerZ".into() };
            }
        }
        let mut r = solve_contact_2d(&model)?;
        total_iters += r.iterations;
        let mut next = Vec::new();
        for &nid in &uplift {
            let bearing = if lifted.contains(&nid) {
                r.results.displacements.iter().find(|d| d.node_id == nid).is_some_and(|d| d.uz < 0.0)
            } else {
                r.results.reactions.iter().find(|x| x.node_id == nid).is_none_or(|x| x.rz >= 0.0)
            };
            if !bearing {
                next.push(nid);
            }
        }
        let changed = next != lifted;
        for nid in uplift.iter().filter(|n| next.contains(n) != lifted.contains(n)) {
            *flips.entry(*nid).or_insert(0) += 1;
        }
        if !changed || flips.values().any(|&f| f > input.max_flips.unwrap_or(4)) {
            for &nid in &lifted {
                if !r.results.reactions.iter().any(|x| x.node_id == nid) {
                    r.results.reactions.push(Reaction { node_id: nid, rx: 0.0, rz: 0.0, my: 0.0 });
                }
                r.diagnostics.push(format!("Uplift support at node {nid} lifted off (no vertical reaction)."));
            }
            r.results.reactions.sort_by_key(|x| x.node_id);
            r.converged &= !changed;
            if changed {
                r.diagnostics.push("Uplift supports oscillated; status frozen.".into());
            }
            r.iterations = total_iters;
            return Ok(r);
        }
        lifted = next;
    }
    Err("Contact analysis: the uplift supports did not settle within max_iter.".into())
}

/// Solve a 2D structure with contact/gap elements.
///
/// Every iteration solves the model as it stands in the current contact
/// state: deactivated members removed (the model is reassembled without
/// them), closed gaps and node-to-surface pairs added as penalty springs that
/// act from the moment they close. The results (displacements, reactions,
/// member forces) are those of the converged state; a deactivated member
/// carries only its own fixed-end forces.
pub fn solve_contact_2d(input: &ContactInput) -> Result<ContactResult, String> {
    let mut r = solve_contact_2d_contained(input)?;
    crate::known_issues::attach(&mut r.results.structured_diagnostics, crate::known_issues::for_2d(&input.solver, crate::known_issues::Analysis::Contact).into_iter().filter(|d| d.phase.as_deref() != Some("NL-13") || r.diagnostics.iter().any(|s| s.contains("frozen"))).collect());
    Ok(r)
}

fn solve_contact_2d_contained(input: &ContactInput) -> Result<ContactResult, String> {
    // Contact assembles the model itself, so it needs the same guarantee the
    // linear path gets before touching `node_by_id[&…]`.
    super::linear::validate_input_2d(&input.solver)?;
    if !input.uplift_supports.is_empty() {
        return solve_uplift_2d(input);
    }
    let max_iter = input.max_iter.unwrap_or(30);
    let max_flips = input.max_flips.unwrap_or(4);
    let al_factor = input.augmented_lagrangian.unwrap_or(0.0);
    let al_max_iter = input.al_max_iter.unwrap_or(5);
    let damping_coeff = input.damping_coefficient.unwrap_or(0.0);
    let damping = (damping_coeff > 0.0).then_some(damping_coeff);

    let dof_num = DofNumbering::build_2d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }
    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    let cs = FreeConstraintSystem::build_2d(&input.solver, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);
    let use_sparse = ns >= linear::SPARSE_THRESHOLD;

    let node_by_id: HashMap<usize, &SolverNode> = crate::ordered::values(&input.solver.nodes).map(|n| (n.id, n)).collect();
    let elem_by_id: HashMap<usize, &SolverElement> = crate::ordered::values(&input.solver.elements).map(|e| (e.id, e)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> = crate::ordered::values(&input.solver.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection> = crate::ordered::values(&input.solver.sections).map(|s| (s.id, s)).collect();

    // Element behaviours, resolved and checked: an id that names no member
    // or a behaviour that is not one of the two would otherwise be dropped.
    let mut behaviors: Vec<(usize, &str)> = Vec::new();
    for (eid_str, behavior) in &input.element_behaviors {
        let elem = eid_str
            .parse::<usize>()
            .ok()
            .and_then(|id| elem_by_id.get(&id))
            .ok_or_else(|| format!("Contact analysis: element behaviour given for unknown element '{eid_str}'"))?;
        if behavior != "tension_only" && behavior != "compression_only" {
            return Err(format!(
                "Contact analysis: unknown behaviour '{behavior}' for element {} (expected tension_only or compression_only)",
                elem.id
            ));
        }
        if input.solver.loads.iter().any(|l| matches!(l, SolverLoad::Thermal(t) if t.element_id == elem.id)) {
            return Err(format!(
                "Contact analysis does not support thermal loads on a tension- or compression-only member (element {}).",
                elem.id
            ));
        }
        behaviors.push((elem.id, behavior.as_str()));
    }
    behaviors.sort();

    // Loads, prescribed displacements and inclined frames do not depend on
    // the contact state; the stiffness is rebuilt when a member changes state.
    let inactive_of = |st: &ContactState2D| -> Vec<usize> {
        behaviors.iter().filter(|(id, _)| st.elem[id] == ContactStatus::Inactive).map(|&(id, _)| id).collect()
    };
    let mut base_inactive: Vec<usize> = Vec::new();
    let (mut base, its) = BaseStiffness::build(&input.solver, &base_inactive, &dof_num, use_sparse);
    let f_base = assembly::assemble_load_vector_2d(&input.solver, &input.solver.loads, &dof_num, &its);
    let u_r = linear::prescribed_displacements_2d(&input.solver, &dof_num);
    let to_global = |u: &[f64]| {
        let mut g = u.to_vec();
        for it in &its {
            assembly::reverse_inclined_transform_2d(&mut g, &it.dofs, &it.r);
        }
        g
    };
    // Axial force of a member from global displacements.
    let axial = |eid: usize, u: &[f64]| -> f64 {
        let elem = elem_by_id[&eid];
        let ni = node_by_id[&elem.node_i];
        let nj = node_by_id[&elem.node_j];
        let (dx, dz) = (nj.x - ni.x, nj.z - ni.z);
        let l = (dx * dx + dz * dz).sqrt();
        let get = |node: usize, d: usize| dof_num.global_dof(node, d).map(|g| u[g]).unwrap_or(0.0);
        let delta = ((get(elem.node_j, 0) - get(elem.node_i, 0)) * dx + (get(elem.node_j, 1) - get(elem.node_i, 1)) * dz) / l;
        mat_by_id[&elem.material_id].e * 1000.0 * sec_by_id[&elem.section_id].a / l * delta
    };

    let mut st = ContactState2D {
        elem: behaviors.iter().map(|&(id, _)| (id, ContactStatus::Active)).collect(),
        gap: vec![ContactStatus::Inactive; input.gap_elements.len()],
        gap_lambda: vec![0.0; input.gap_elements.len()],
        gap_flips: vec![0; input.gap_elements.len()],
        gap_slip: vec![0.0; input.gap_elements.len()],
        n2s: vec![ContactStatus::Inactive; input.node_to_surface_pairs.len()],
        n2s_lambda: vec![0.0; input.node_to_surface_pairs.len()],
        n2s_slip: vec![0.0; input.node_to_surface_pairs.len()],
    };
    let mut n2s_flips = vec![0usize; input.node_to_surface_pairs.len()];
    let mut elem_flips: HashMap<usize, usize> = HashMap::new();

    let mut sparse_sym_cache: Option<SparseSymbolicCache> = None;

    let mut u_global = vec![0.0; n];
    let mut converged = false;
    let mut total_iters = 0;
    let al = al_factor > 0.0;
    let al_outer_iters = if al { al_max_iter } else { 1 };
    let mut al_iter_count = 0;

    for al_iter in 0..al_outer_iters {
        al_iter_count = al_iter + 1;
        st.gap_flips.iter_mut().for_each(|f| *f = 0);
        n2s_flips.iter_mut().for_each(|f| *f = 0);
        elem_flips.values_mut().for_each(|f| *f = 0);
        let mut inner_converged = false;

        for iter in 0..max_iter {
            total_iters += 1;
            let inactive = inactive_of(&st);
            if inactive != base_inactive {
                base = BaseStiffness::build(&input.solver, &inactive, &dof_num, use_sparse).0;
                base_inactive = inactive;
            }
            let corr = contact_corrections_2d(input, &st, &node_by_id, &dof_num, &u_global, damping, al, &its);
            let u = solve_contact_state(&base, &corr, &f_base, &u_r, nf, &cs, &mut sparse_sym_cache)?;
            u_global = to_global(&u);

            let mut any_change = false;
            for &(eid, behavior) in &behaviors {
                let nforce = axial(eid, &u_global);
                let new = match behavior {
                    "tension_only" if nforce < -1e-10 => ContactStatus::Inactive,
                    "compression_only" if nforce > 1e-10 => ContactStatus::Inactive,
                    _ => ContactStatus::Active,
                };
                if st.elem[&eid] != new {
                    any_change = true;
                    *elem_flips.entry(eid).or_insert(0) += 1;
                    st.elem.insert(eid, new);
                }
            }
            for (gi, gap) in input.gap_elements.iter().enumerate() {
                let new = if gap_relative_2d(gap, &dof_num, &u_global) < -gap.initial_gap {
                    ContactStatus::Active
                } else {
                    ContactStatus::Inactive
                };
                if st.gap[gi] != new {
                    st.gap_flips[gi] += 1;
                    // Past max_flips the status is frozen to stop chattering.
                    if st.gap_flips[gi] <= max_flips {
                        any_change = true;
                        st.gap[gi] = new;
                    }
                }
                let slip = match (st.gap[gi], gap.friction.or(gap.friction_coefficient), gap.friction_direction) {
                    (ContactStatus::Active, Some(mu), Some(_)) => {
                        let normal = gap_normal_force_2d(gap, st.gap_lambda[gi], al, &dof_num, &u_global);
                        next_slip(st.gap_slip[gi], mu * gap.stiffness * gap_tangential_2d(gap, &dof_num, &u_global), mu * normal)
                    }
                    _ => 0.0,
                };
                if slip != st.gap_slip[gi] && st.gap_flips[gi] <= max_flips {
                    st.gap_flips[gi] += 1;
                    any_change = true;
                    st.gap_slip[gi] = slip;
                }
            }
            for (pi, pair) in input.node_to_surface_pairs.iter().enumerate() {
                let (_, _, g) = project_slave_onto_segment_2d(pair, &node_by_id, &dof_num, &u_global);
                let new = if g < 0.0 { ContactStatus::Active } else { ContactStatus::Inactive };
                if st.n2s[pi] != new {
                    n2s_flips[pi] += 1;
                    if n2s_flips[pi] <= max_flips {
                        any_change = true;
                        st.n2s[pi] = new;
                    }
                }
                let slip = match (st.n2s[pi], pair.friction_coefficient) {
                    (ContactStatus::Active, Some(mu)) => {
                        let normal = n2s_normal_force_2d(pair, st.n2s_lambda[pi], al, &node_by_id, &dof_num, &u_global);
                        let tang = n2s_tangential_2d(pair, &node_by_id, &dof_num, &u_global);
                        next_slip(st.n2s_slip[pi], mu * pair.stiffness * tang, mu * normal)
                    }
                    _ => 0.0,
                };
                if slip != st.n2s_slip[pi] && n2s_flips[pi] <= max_flips {
                    n2s_flips[pi] += 1;
                    any_change = true;
                    st.n2s_slip[pi] = slip;
                }
            }
            if !any_change && iter > 0 {
                inner_converged = true;
                break;
            }
        }

        if !al {
            converged = inner_converged;
            break;
        }
        // Augmented Lagrangian: accumulate the penetration force.
        let mut al_converged = true;
        for (gi, gap) in input.gap_elements.iter().enumerate() {
            if st.gap[gi] == ContactStatus::Active {
                let penetration = -gap_relative_2d(gap, &dof_num, &u_global) - gap.initial_gap;
                if penetration > 0.0 {
                    st.gap_lambda[gi] += al_factor * gap.stiffness * penetration;
                    if penetration > 1e-10 {
                        al_converged = false;
                    }
                }
            }
        }
        for (pi, pair) in input.node_to_surface_pairs.iter().enumerate() {
            if st.n2s[pi] == ContactStatus::Active {
                let (_, _, g) = project_slave_onto_segment_2d(pair, &node_by_id, &dof_num, &u_global);
                if g < 0.0 {
                    st.n2s_lambda[pi] += al_factor * pair.stiffness * -g;
                    if -g > 1e-10 {
                        al_converged = false;
                    }
                }
            }
        }
        if al_converged || !inner_converged {
            converged = inner_converged && al_converged;
            break;
        }
    }

    // Final state, solved once more without the damping term (it only
    // steadies the status iteration and is not part of the structure).
    let inactive = inactive_of(&st);
    if inactive != base_inactive {
        base = BaseStiffness::build(&input.solver, &inactive, &dof_num, use_sparse).0;
    }
    let corr = contact_corrections_2d(input, &st, &node_by_id, &dof_num, &u_global, None, al, &its);
    let u = solve_contact_state(&base, &corr, &f_base, &u_r, nf, &cs, &mut sparse_sym_cache)?;
    // The iterate the final corrections were built from (sliding friction
    // forces are μ·N of this state).
    let u_iter = std::mem::replace(&mut u_global, to_global(&u));

    let diagnostics = build_diagnostics_2d(
        &st.gap_flips,
        &input.gap_elements,
        &elem_flips,
        &input.element_behaviors,
        &n2s_flips,
        &input.node_to_surface_pairs,
        max_flips,
    );

    // Residual of the final state, R = K·u − f over all DOFs (frames of K):
    // the restrained part is the reactions, the free part the constraint
    // forces.
    let mut residual = base.mul(&u);
    for (r, f) in residual.iter_mut().zip(&f_base) {
        *r -= f;
    }
    for c in &corr {
        let m = c.dofs.len();
        for a in 0..m {
            residual[c.dofs[a]] -= c.f[a];
            for b in 0..m {
                residual[c.dofs[a]] += c.k[a * m + b] * u[c.dofs[b]];
            }
        }
    }
    let mut reactions = linear::build_reactions_2d_inclined(
        &input.solver, &dof_num, &residual[nf..], &f_base[nf..], nf, &u_global, &its,
    );
    reactions.sort_by_key(|r| r.node_id);
    let constraint_forces = match &cs {
        Some(cs) => cs.constraint_forces(
            &cs.constraint_forces_from_residual(&residual[..nf]),
            &dof_num,
        ),
        None => vec![],
    };
    // A deactivated member is not deformed by the structure; it carries only
    // its own fixed-end forces (the member loads it still passes to its nodes).
    let mut element_forces = linear::compute_internal_forces_2d(&input.solver, &dof_num, &u_global);
    if !inactive.is_empty() {
        let at_rest = linear::compute_internal_forces_2d(&input.solver, &dof_num, &vec![0.0; n]);
        for ef in element_forces.iter_mut() {
            if inactive.contains(&ef.element_id) {
                if let Some(rest) = at_rest.iter().find(|r| r.element_id == ef.element_id) {
                    *ef = rest.clone();
                }
            }
        }
    }
    element_forces.sort_by_key(|ef| ef.element_id);
    let results = AnalysisResults {
        displacements: linear::build_displacements_2d(&dof_num, &u_global),
        reactions,
        element_forces,
        constraint_forces,
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: vec![],
        equilibrium: None,
        result_summary: None,
        solver_run_meta: None,
    };

    let element_status_info: Vec<ElementContactInfo> = behaviors
        .iter()
        .map(|&(eid, behavior)| {
            let active = st.elem[&eid] == ContactStatus::Active;
            ElementContactInfo {
                element_id: eid,
                behavior: behavior.to_string(),
                status: if active { "active".into() } else { "inactive".into() },
                force: if active { axial(eid, &u_global) } else { 0.0 },
            }
        })
        .collect();

    let gap_info: Vec<GapContactInfo> = input
        .gap_elements
        .iter()
        .enumerate()
        .map(|(gi, gap)| {
            let relative_disp = gap_relative_2d(gap, &dof_num, &u_global);
            let closed = st.gap[gi] == ContactStatus::Active;
            // Force in the spring as solved (negative = compression), with
            // the augmented-Lagrangian multiplier it carries.
            let force = if closed {
                gap.stiffness * (relative_disp + gap.initial_gap) - if al { st.gap_lambda[gi] } else { 0.0 }
            } else {
                0.0
            };
            let penetration = if closed { (-relative_disp - gap.initial_gap).max(0.0) } else { 0.0 };
            // The tangential force as solved: the stick spring's, or μ·N
            // when sliding.
            let friction_force = match (closed, gap.friction.or(gap.friction_coefficient), gap.friction_direction) {
                (true, Some(mu), Some(_)) if st.gap_slip[gi] == 0.0 => mu * gap.stiffness * gap_tangential_2d(gap, &dof_num, &u_global),
                (true, Some(mu), Some(_)) => {
                    st.gap_slip[gi] * mu * gap_normal_force_2d(gap, st.gap_lambda[gi], al, &dof_num, &u_iter)
                }
                _ => 0.0,
            };
            GapContactInfo {
                id: gap.id,
                status: if closed { "closed".into() } else { "open".into() },
                displacement: relative_disp,
                force,
                penetration,
                friction_force,
            }
        })
        .collect();

    let n2s_info: Vec<NodeToSurfaceContactInfo> = input
        .node_to_surface_pairs
        .iter()
        .enumerate()
        .map(|(pi, pair)| {
            let (_, xi, gap_val) = project_slave_onto_segment_2d(pair, &node_by_id, &dof_num, &u_global);
            let closed = st.n2s[pi] == ContactStatus::Active;
            let normal_force = if closed { n2s_normal_force_2d(pair, st.n2s_lambda[pi], al, &node_by_id, &dof_num, &u_global) } else { 0.0 };
            let friction_force = match (closed, pair.friction_coefficient) {
                (true, Some(mu)) if st.n2s_slip[pi] == 0.0 => {
                    mu * pair.stiffness * n2s_tangential_2d(pair, &node_by_id, &dof_num, &u_global)
                }
                (true, Some(mu)) => {
                    st.n2s_slip[pi] * mu * n2s_normal_force_2d(pair, st.n2s_lambda[pi], al, &node_by_id, &dof_num, &u_iter)
                }
                _ => 0.0,
            };
            NodeToSurfaceContactInfo {
                slave_node: pair.slave_node,
                master_segment_id: pair.master_segment.id,
                status: if closed { "closed".into() } else { "open".into() },
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

/// u_j − u_i of a 2D gap along its direction (global axes).
fn gap_relative_2d(gap: &GapElement, dof_num: &DofNumbering, u: &[f64]) -> f64 {
    let dir = gap.direction.min(1);
    let u_i = dof_num.global_dof(gap.node_i, dir).map(|d| u[d]).unwrap_or(0.0);
    let u_j = dof_num.global_dof(gap.node_j, dir).map(|d| u[d]).unwrap_or(0.0);
    u_j - u_i
}

/// Tangential slip u_j − u_i of a 2D gap along its friction direction.
fn gap_tangential_2d(gap: &GapElement, dof_num: &DofNumbering, u: &[f64]) -> f64 {
    let fdir = gap.friction_direction.unwrap_or(0).min(1);
    let u_i = dof_num.global_dof(gap.node_i, fdir).map(|d| u[d]).unwrap_or(0.0);
    let u_j = dof_num.global_dof(gap.node_j, fdir).map(|d| u[d]).unwrap_or(0.0);
    u_j - u_i
}

/// Compressive force a closed 2D gap carries (≥ 0), with its AL multiplier.
fn gap_normal_force_2d(gap: &GapElement, lambda: f64, al: bool, dof_num: &DofNumbering, u: &[f64]) -> f64 {
    let pen = -gap_relative_2d(gap, dof_num, u) - gap.initial_gap;
    (gap.stiffness * pen + if al { lambda } else { 0.0 }).max(0.0)
}

/// Contact force of a node-to-surface pair (≥ 0), with its AL multiplier.
fn n2s_normal_force_2d(
    pair: &NodeToSurfacePair,
    lambda: f64,
    al: bool,
    node_by_id: &HashMap<usize, &SolverNode>,
    dof_num: &DofNumbering,
    u: &[f64],
) -> f64 {
    let (_, _, g) = project_slave_onto_segment_2d(pair, node_by_id, dof_num, u);
    (pair.stiffness * -g + if al { lambda } else { 0.0 }).max(0.0)
}

/// Tangential displacement of the slave relative to the segment point it
/// projects to (displacements only, as the stick spring measures it).
fn n2s_tangential_2d(pair: &NodeToSurfacePair, node_by_id: &HashMap<usize, &SolverNode>, dof_num: &DofNumbering, u: &[f64]) -> f64 {
    let (normal, xi, _) = project_slave_onto_segment_2d(pair, node_by_id, dof_num, u);
    let (tx, tz) = (-normal[1], normal[0]);
    let (na, nb) = (1.0 - xi, xi);
    let get = |node: usize, d: usize| dof_num.global_dof(node, d).map(|g| u[g]).unwrap_or(0.0);
    let rel_x = get(pair.slave_node, 0) - (na * get(pair.master_segment.node_a, 0) + nb * get(pair.master_segment.node_b, 0));
    let rel_z = get(pair.slave_node, 1) - (na * get(pair.master_segment.node_a, 1) + nb * get(pair.master_segment.node_b, 1));
    rel_x * tx + rel_z * tz
}

/// Coulomb stick/slip update: a sticking contact slides once its stick force
/// exceeds μ·N (in the direction of that force); a sliding one sticks again
/// when the slip reverses.
fn next_slip(slip: f64, stick_force: f64, limit: f64) -> f64 {
    if slip == 0.0 {
        if stick_force.abs() > limit * (1.0 + 1e-9) && stick_force != 0.0 { stick_force.signum() } else { 0.0 }
    } else if stick_force * slip < 0.0 {
        0.0
    } else {
        slip
    }
}

// ---------------------------------------------------------------------------
// 3D solver
// ---------------------------------------------------------------------------

/// Solve a 3D structure with contact/gap elements.
///
/// As `solve_contact_2d`: each iteration solves the model in its current
/// contact state (deactivated members removed by reassembling without them,
/// closed gaps as penalty springs acting from the moment they close, built
/// in global axes and rotated into the inclined-support frames), and the
/// results are those of the converged state.
pub fn solve_contact_3d(input: &ContactInput3D) -> Result<ContactResult3D, String> {
    let mut r = solve_contact_3d_contained(input)?;
    crate::known_issues::membrane_bending_3d(&input.solver, &input.solver.loads, &r.results)?;
    crate::known_issues::attach(&mut r.results.structured_diagnostics, crate::known_issues::for_3d(&input.solver, crate::known_issues::Analysis::Contact).into_iter().filter(|d| d.phase.as_deref() != Some("NL-13") || r.diagnostics.iter().any(|s| s.contains("frozen"))).collect());
    Ok(r)
}

fn solve_contact_3d_contained(input: &ContactInput3D) -> Result<ContactResult3D, String> {
    super::linear::validate_input_3d(&input.solver)?;
    if let Some(nid) = input.uplift_supports.first() {
        return Err(format!(
            "3D contact analysis does not support uplift (compression-only) supports (node {nid}); \
             it would keep them as two-way restraints. Model the uplift with a gap element or a \
             compression-only member to a fixed node."
        ));
    }

    let max_iter = input.max_iter.unwrap_or(30);
    let max_flips = input.max_flips.unwrap_or(4);
    let al_factor = input.augmented_lagrangian.unwrap_or(0.0);
    let al = al_factor > 0.0;
    let al_max_iter = input.al_max_iter.unwrap_or(5);
    let damping_coeff = input.damping_coefficient.unwrap_or(0.0);
    let damping = (damping_coeff > 0.0).then_some(damping_coeff);

    // Expand curved beams before DOF numbering and assembly.
    let input_solver = &super::linear::expand_curved_beams_3d(&input.solver);
    let dof_num = DofNumbering::build_3d(input_solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }
    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    let cs = FreeConstraintSystem::build_3d(&input_solver, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);
    let use_sparse = ns >= linear::SPARSE_THRESHOLD;

    let node_by_id: HashMap<usize, &SolverNode3D> = crate::ordered::values(&input_solver.nodes).map(|n| (n.id, n)).collect();
    let elem_by_id: HashMap<usize, &SolverElement3D> = crate::ordered::values(&input_solver.elements).map(|e| (e.id, e)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> = crate::ordered::values(&input_solver.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection3D> = crate::ordered::values(&input_solver.sections).map(|s| (s.id, s)).collect();

    let mut behaviors: Vec<(usize, &str)> = Vec::new();
    for (eid_str, behavior) in &input.element_behaviors {
        let elem = eid_str
            .parse::<usize>()
            .ok()
            .and_then(|id| elem_by_id.get(&id))
            .ok_or_else(|| format!("Contact analysis: element behaviour given for unknown element '{eid_str}'"))?;
        if behavior != "tension_only" && behavior != "compression_only" {
            return Err(format!(
                "Contact analysis: unknown behaviour '{behavior}' for element {} (expected tension_only or compression_only)",
                elem.id
            ));
        }
        if input_solver.loads.iter().any(|l| matches!(l, SolverLoad3D::Thermal(t) if t.element_id == elem.id)) {
            return Err(format!(
                "Contact analysis does not support thermal loads on a tension- or compression-only member (element {}).",
                elem.id
            ));
        }
        behaviors.push((elem.id, behavior.as_str()));
    }
    behaviors.sort();

    // The full model's assembly gives the loads and the inclined frames,
    // which do not depend on the contact state, and the first stiffness.
    let (mut base, f_base, its) = if use_sparse {
        let a = assembly::assemble_sparse_3d(input_solver, &dof_num, true);
        (BaseStiffness::Sparse(a.k_full.expect("k_full requested")), a.f, a.inclined_transforms)
    } else {
        let a = assembly::assemble_3d(input_solver, &dof_num);
        (BaseStiffness::Dense(a.k), a.f, a.inclined_transforms)
    };
    let u_r = linear::prescribed_displacements_3d(input_solver, &dof_num);
    let to_global = |u: &[f64]| {
        let mut g = u.to_vec();
        for it in &its {
            assembly::reverse_inclined_transform(&mut g, &it.dofs, &it.r);
        }
        g
    };
    let axial = |eid: usize, u: &[f64]| -> f64 {
        let elem = elem_by_id[&eid];
        let (ni, nj) = (node_by_id[&elem.node_i], node_by_id[&elem.node_j]);
        let d = [nj.x - ni.x, nj.y - ni.y, nj.z - ni.z];
        let l = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
        let get = |node: usize, k: usize| dof_num.global_dof(node, k).map(|g| u[g]).unwrap_or(0.0);
        let delta: f64 = (0..3).map(|k| (get(elem.node_j, k) - get(elem.node_i, k)) * d[k]).sum::<f64>() / l;
        mat_by_id[&elem.material_id].e * 1000.0 * sec_by_id[&elem.section_id].a / l * delta
    };
    let rel = |gap: &GapElement, dir: usize, u: &[f64]| -> f64 {
        let get = |node: usize| dof_num.global_dof(node, dir).map(|g| u[g]).unwrap_or(0.0);
        get(gap.node_j) - get(gap.node_i)
    };
    let normal_force = |gi: usize, gap: &GapElement, lambda: &[f64], u: &[f64]| -> f64 {
        let pen = -rel(gap, gap.direction.min(2), u) - gap.initial_gap;
        (gap.stiffness * pen + if al { lambda[gi] } else { 0.0 }).max(0.0)
    };

    let mut elem_status: HashMap<usize, ContactStatus> = behaviors.iter().map(|&(id, _)| (id, ContactStatus::Active)).collect();
    let mut elem_flips: HashMap<usize, usize> = HashMap::new();
    let ng = input.gap_elements.len();
    let mut gap_status = vec![ContactStatus::Inactive; ng];
    let mut gap_flips = vec![0usize; ng];
    let mut gap_lambda = vec![0.0; ng];
    let mut gap_slip = vec![0.0; ng];

    // Closed gaps as corrections in global axes, rotated into the frames of K.
    let corrections = |gap_status: &[ContactStatus], gap_flips: &[usize], gap_lambda: &[f64], gap_slip: &[f64], u_cur: &[f64], damping: Option<f64>| {
        let mut out = Vec::new();
        let pair = |k: f64| vec![k, -k, -k, k];
        for (gi, gap) in input.gap_elements.iter().enumerate() {
            if gap_status[gi] != ContactStatus::Active {
                continue;
            }
            let dir = gap.direction.min(2); // 3D: 0=X, 1=Y, 2=Z
            if let (Some(&di), Some(&dj)) = (dof_num.map.get(&(gap.node_i, dir)), dof_num.map.get(&(gap.node_j, dir))) {
                let k = gap.stiffness;
                let push = k * gap.initial_gap - if al { gap_lambda[gi] } else { 0.0 };
                let mut c = Correction { dofs: vec![di, dj], k: pair(k), f: vec![push, -push] };
                if let Some(cd) = damping.filter(|_| gap_flips[gi] > 0) {
                    c.k[0] += cd;
                    c.k[3] += cd;
                    c.f[0] += cd * u_cur[di];
                    c.f[1] += cd * u_cur[dj];
                }
                out.push(c);
            }
            if let (Some(mu), Some(fdir)) = (gap.friction.or(gap.friction_coefficient), gap.friction_direction) {
                let fdir = fdir.min(2);
                if let (Some(&fi), Some(&fj)) = (dof_num.map.get(&(gap.node_i, fdir)), dof_num.map.get(&(gap.node_j, fdir))) {
                    if gap_slip[gi] == 0.0 {
                        out.push(Correction { dofs: vec![fi, fj], k: pair(mu * gap.stiffness), f: vec![0.0, 0.0] });
                    } else {
                        let fr = gap_slip[gi] * mu * normal_force(gi, gap, gap_lambda, u_cur);
                        out.push(Correction { dofs: vec![fi, fj], k: vec![0.0; 4], f: vec![fr, -fr] });
                    }
                }
            }
        }
        out.into_iter().map(|c| c.rotated_3d(&its)).collect::<Vec<_>>()
    };
    let inactive_of = |elem_status: &HashMap<usize, ContactStatus>| -> Vec<usize> {
        behaviors.iter().filter(|(id, _)| elem_status[id] == ContactStatus::Inactive).map(|&(id, _)| id).collect()
    };

    let mut base_inactive: Vec<usize> = Vec::new();
    let mut sparse_sym_cache: Option<SparseSymbolicCache> = None;
    let mut u_global = vec![0.0; n];
    let mut converged = false;
    let mut total_iters = 0;
    let al_outer_iters = if al { al_max_iter } else { 1 };
    let mut al_iter_count = 0;

    for al_iter in 0..al_outer_iters {
        al_iter_count = al_iter + 1;
        gap_flips.iter_mut().for_each(|f| *f = 0);
        elem_flips.values_mut().for_each(|f| *f = 0);
        let mut inner_converged = false;

        for iter in 0..max_iter {
            total_iters += 1;
            let inactive = inactive_of(&elem_status);
            if inactive != base_inactive {
                base = BaseStiffness::build_3d(input_solver, &inactive, &dof_num, use_sparse);
                base_inactive = inactive;
            }
            let corr = corrections(&gap_status, &gap_flips, &gap_lambda, &gap_slip, &u_global, damping);
            let u = solve_contact_state(&base, &corr, &f_base, &u_r, nf, &cs, &mut sparse_sym_cache)?;
            u_global = to_global(&u);

            let mut any_change = false;
            for &(eid, behavior) in &behaviors {
                let nforce = axial(eid, &u_global);
                let new = match behavior {
                    "tension_only" if nforce < -1e-10 => ContactStatus::Inactive,
                    "compression_only" if nforce > 1e-10 => ContactStatus::Inactive,
                    _ => ContactStatus::Active,
                };
                if elem_status[&eid] != new {
                    any_change = true;
                    *elem_flips.entry(eid).or_insert(0) += 1;
                    elem_status.insert(eid, new);
                }
            }
            for (gi, gap) in input.gap_elements.iter().enumerate() {
                let new = if rel(gap, gap.direction.min(2), &u_global) < -gap.initial_gap {
                    ContactStatus::Active
                } else {
                    ContactStatus::Inactive
                };
                if gap_status[gi] != new {
                    gap_flips[gi] += 1;
                    if gap_flips[gi] <= max_flips {
                        any_change = true;
                        gap_status[gi] = new;
                    }
                }
                let slip = match (gap_status[gi], gap.friction.or(gap.friction_coefficient), gap.friction_direction) {
                    (ContactStatus::Active, Some(mu), Some(fdir)) => next_slip(
                        gap_slip[gi],
                        mu * gap.stiffness * rel(gap, fdir.min(2), &u_global),
                        mu * normal_force(gi, gap, &gap_lambda, &u_global),
                    ),
                    _ => 0.0,
                };
                if slip != gap_slip[gi] && gap_flips[gi] <= max_flips {
                    gap_flips[gi] += 1;
                    any_change = true;
                    gap_slip[gi] = slip;
                }
            }
            if !any_change && iter > 0 {
                inner_converged = true;
                break;
            }
        }

        if !al {
            converged = inner_converged;
            break;
        }
        let mut al_converged = true;
        for (gi, gap) in input.gap_elements.iter().enumerate() {
            if gap_status[gi] == ContactStatus::Active {
                let penetration = -rel(gap, gap.direction.min(2), &u_global) - gap.initial_gap;
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
    }

    // Final state without the damping term.
    let inactive = inactive_of(&elem_status);
    if inactive != base_inactive {
        base = BaseStiffness::build_3d(input_solver, &inactive, &dof_num, use_sparse);
    }
    let corr = corrections(&gap_status, &gap_flips, &gap_lambda, &gap_slip, &u_global, None);
    let u = solve_contact_state(&base, &corr, &f_base, &u_r, nf, &cs, &mut sparse_sym_cache)?;
    let u_iter = std::mem::replace(&mut u_global, to_global(&u));

    let diagnostics = build_diagnostics_3d(&gap_flips, &input.gap_elements, &elem_flips, &input.element_behaviors, max_flips);

    // R = K·u − f over all DOFs (frames of K): reactions and constraint forces.
    let mut residual = base.mul(&u);
    for (r, f) in residual.iter_mut().zip(&f_base) {
        *r -= f;
    }
    for c in &corr {
        let m = c.dofs.len();
        for a in 0..m {
            residual[c.dofs[a]] -= c.f[a];
            for b in 0..m {
                residual[c.dofs[a]] += c.k[a * m + b] * u[c.dofs[b]];
            }
        }
    }
    let mut reactions = linear::build_reactions_3d_inclined(
        input_solver, &dof_num, &residual[nf..], &f_base[nf..], nf, &u_global, &its,
    );
    reactions.sort_by_key(|r| r.node_id);
    let constraint_forces = match &cs {
        Some(cs) => cs.constraint_forces(
            &cs.constraint_forces_from_residual(&residual[..nf]),
            &dof_num,
        ),
        None => vec![],
    };
    let mut element_forces = linear::compute_internal_forces_3d(input_solver, &dof_num, &u_global);
    if !inactive.is_empty() {
        let at_rest = linear::compute_internal_forces_3d(input_solver, &dof_num, &vec![0.0; n]);
        for ef in element_forces.iter_mut() {
            if inactive.contains(&ef.element_id) {
                if let Some(rest) = at_rest.iter().find(|r| r.element_id == ef.element_id) {
                    *ef = rest.clone();
                }
            }
        }
    }
    element_forces.sort_by_key(|ef| ef.element_id);

    let results = AnalysisResults3D {
        displacements: linear::build_displacements_3d(&dof_num, &u_global),
        reactions,
        element_forces,
        plate_stresses: linear::compute_plate_stresses(input_solver, &dof_num, &u_global, None),
        quad_stresses: linear::compute_quad_stresses(input_solver, &dof_num, &u_global, None),
        quad_nodal_stresses: vec![],
        constraint_forces,
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: vec![],
        equilibrium: None,
        timings: None,
        result_summary: None,
        solver_run_meta: None,
    };

    let element_status_info: Vec<ElementContactInfo> = behaviors
        .iter()
        .map(|&(eid, behavior)| {
            let active = elem_status[&eid] == ContactStatus::Active;
            ElementContactInfo {
                element_id: eid,
                behavior: behavior.to_string(),
                status: if active { "active".into() } else { "inactive".into() },
                force: if active { axial(eid, &u_global) } else { 0.0 },
            }
        })
        .collect();

    let gap_info: Vec<GapContactInfo> = input
        .gap_elements
        .iter()
        .enumerate()
        .map(|(gi, gap)| {
            let relative_disp = rel(gap, gap.direction.min(2), &u_global);
            let closed = gap_status[gi] == ContactStatus::Active;
            let force = if closed {
                gap.stiffness * (relative_disp + gap.initial_gap) - if al { gap_lambda[gi] } else { 0.0 }
            } else {
                0.0
            };
            let penetration = if closed { (-relative_disp - gap.initial_gap).max(0.0) } else { 0.0 };
            let friction_force = match (closed, gap.friction.or(gap.friction_coefficient), gap.friction_direction) {
                (true, Some(mu), Some(fdir)) if gap_slip[gi] == 0.0 => mu * gap.stiffness * rel(gap, fdir.min(2), &u_global),
                (true, Some(mu), Some(_)) => gap_slip[gi] * mu * normal_force(gi, gap, &gap_lambda, &u_iter),
                _ => 0.0,
            };
            GapContactInfo {
                id: gap.id,
                status: if closed { "closed".into() } else { "open".into() },
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
    let y0 = node.map(|n| n.z).unwrap_or(0.0);
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
        if flips >= 2 || flips > max_flips {
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
                if flips >= 2 || flips > max_flips {
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
        if flips >= 2 || flips > max_flips {
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
        if flips >= 2 || flips > max_flips {
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
                if flips >= 2 || flips > max_flips {
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

#[cfg(test)]
mod containment_tests {
    use super::*;
    #[test]
    fn freezing_on_the_first_flip_is_reported() {
        let gap = GapElement { id: 1, node_i: 1, node_j: 2, direction: 0, initial_gap: 0.0, stiffness: 1.0, friction: None, friction_direction: None, friction_coefficient: None };
        for flips in [0, 1, 2] {
            let diagnostics = build_diagnostics_3d(&[flips], &[gap.clone()], &HashMap::new(), &HashMap::new(), 0);
            assert_eq!(diagnostics.iter().any(|s| s.contains("frozen")), flips > 0);
        }
    }
}
