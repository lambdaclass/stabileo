//! End-to-end certificates: re-assemble `K` and `f` from the model, not from
//! the engine. See "End-to-end certificates" in `docs/verification/CERTIFY.md`.
//!
//! The linear certificate (`certify::solver`) proves that the returned
//! displacements solve the f64 `K` and `f` the engine assembled. This module
//! closes the gap between the model and that system: it re-derives the
//! stiffness and loads of every member from the model's JSON fields, in
//! interval arithmetic, from closed-form formulas written for this checker
//! (`element.rs`: cantilever flexibility + equilibrium, static condensation,
//! work-equivalent loads on the exact Timoshenko shapes), with its own DOF
//! numbering, supports, inclined supports and constraints (`u = C q + p`).
//! Nothing in `crate::element` or `crate::solver` is called to build it.
//!
//! Two checks, both required for `EndToEnd::Certified`:
//!
//! 1. **Bound against the model.** With `A = Cᵀ K C` enclosed in intervals
//!    for the exact model `K`, the Gram-residual + Gershgorin test certifies
//!    `λ_min(A) ≥ μ > 0` (so the model has a unique solution), the residual
//!    `r = Cᵀ(f − K(C q̃ + p))` is enclosed, and
//!    `‖u* − ũ‖₂ ≤ ‖C‖₂·‖r‖₂/μ + ‖C q̃ + p − ũ‖₂` over every DOF the model
//!    determines. This is a statement about the exact solution of the model
//!    as written, independent of the engine's assembly.
//! 2. **Agreement.** The engine's assembled `K` and `f` (in global axes) must
//!    lie within `1e-10` of the scale of each entry of the re-assembled
//!    enclosures. A disagreement means the engine assembled a different
//!    model (an assembly bug, or a convention this checker reads
//!    differently), and the end-to-end status is `Failed`, whatever the bound.
//!
//! Scope: 2D and 3D frames (Euler–Bernoulli and Timoshenko), trusses and
//! cables (linear), releases, local axes (reference vector, roll angle,
//! left-handed axes), supports with springs and settlements, inclined
//! supports, rigid links, diaphragms, equal-DOF, eccentric connections and
//! linear MPCs, nodal, distributed, point and thermal member loads. Anything
//! else (shells, connectors, curved beams, warping, …) is `OutOfScope`.

mod element;
pub(crate) mod ia;
mod model2d;
mod model3d;
mod system;

use serde::{Deserialize, Serialize};

use crate::types::*;
pub use system::{Agreement, EngineAssembly};
use system::{agreement, certify, Model};

/// Discrepancy the agreement check accepts, relative to the entry's scale.
pub const AGREEMENT_TOL: f64 = 1e-10;

/// Largest violation of the model's kinematics (supports, settlements,
/// inclined supports, constraints) the returned displacements may show,
/// relative to their norm: `‖C q̃ + p − ũ‖ ≤ KINEMATIC_TOL·‖ũ‖`.
pub const KINEMATIC_TOL: f64 = 1e-9;

/// A DOF named by node and local index (2D: ux, uz, θ; 3D: ux, uy, uz, rx, ry, rz).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DofRef {
    pub node_id: usize,
    pub dof: usize,
}

/// End-to-end status of a certified linear solve.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(tag = "status", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum EndToEnd {
    /// The displacements are within `abs_bound` (‖·‖₂ over every DOF the
    /// model determines, all DOFs in global axes) of the exact solution of the
    /// model as written, and the engine's assembly agrees with it.
    Certified {
        abs_bound: f64,
        rel_bound: f64,
        /// Certified λ_min(CᵀKC) ≥ mu > 0 for the model's exact K.
        mu: f64,
        /// Upper bound on ‖Cᵀ(f − K(C q̃ + p))‖₂.
        residual_norm: f64,
        /// Largest relative discrepancy of the engine's K / f from the re-assembly.
        k_discrepancy: f64,
        f_discrepancy: f64,
        /// DOFs nothing stiffens (rotations of truss-only or fully released
        /// nodes): the model leaves them undetermined; not covered.
        excluded_dofs: Vec<DofRef>,
    },
    /// Checked, and the engine's assembly does not match the model, or the
    /// model provably has no solution (a load on a DOF nothing stiffens) while
    /// the engine returned one.
    Failed { reason: String },
    /// Checked, but no bound against the model could be established (e.g.
    /// the model's stiffness could not be certified positive definite: a
    /// mechanism the engine's artificial stiffness hides, or ill conditioning).
    Uncertified { reason: String },
    /// The model uses something the re-assembly does not cover.
    OutOfScope { reason: String },
    /// Not attempted (e.g. the assembled-level certificate already failed).
    #[default]
    NotChecked,
}

impl EndToEnd {
    pub fn is_certified(&self) -> bool {
        matches!(self, EndToEnd::Certified { .. })
    }
    pub fn abs_bound(&self) -> Option<f64> {
        match self {
            EndToEnd::Certified { abs_bound, .. } => Some(*abs_bound),
            _ => None,
        }
    }
}

/// Error from model building: out of scope, or a model with no unique solution.
enum BuildErr {
    Scope(String),
    /// The model provably has no solution (a load nothing can resist).
    NoSolution(String),
    Fail(String),
}

fn classify(e: String) -> BuildErr {
    if e.starts_with("out of scope") || e.starts_with("unsupported") {
        BuildErr::Scope(e)
    } else if e.starts_with("a load acts on") {
        BuildErr::NoSolution(e)
    } else {
        BuildErr::Fail(e)
    }
}

fn finish(
    model: Result<Model, String>,
    u: impl FnOnce(&Model) -> Result<Vec<f64>, String>,
    eng: impl FnOnce() -> Result<Vec<EngineAssembly>, String>,
) -> EndToEnd {
    let model = match model.map_err(classify) {
        Ok(m) => m,
        Err(BuildErr::Scope(reason)) => return EndToEnd::OutOfScope { reason },
        Err(BuildErr::NoSolution(reason)) => return EndToEnd::Failed { reason },
        Err(BuildErr::Fail(reason)) => return EndToEnd::Uncertified { reason },
    };
    let u = match u(&model) {
        Ok(u) => u,
        Err(reason) => return EndToEnd::Uncertified { reason },
    };
    let bound = match certify(&model, &u) {
        Ok(b) => b,
        Err(reason) if reason.starts_with("a load acts on") => return EndToEnd::Failed { reason },
        Err(reason) => return EndToEnd::Uncertified { reason: format!("no bound against the re-assembled model: {reason}") },
    };
    // (The absolute floor only lets an all-zero solution through: widened
    // zero inputs leave a mismatch of order 1e-160 there.)
    if !(bound.mismatch_norm <= KINEMATIC_TOL * bound.u_norm + 1e-150) {
        return EndToEnd::Failed {
            reason: format!(
                "the returned displacements violate the model's supports or constraints (‖C q̃ + p − ũ‖ = {:.3e}, ‖ũ‖ = {:.3e})",
                bound.mismatch_norm, bound.u_norm
            ),
        };
    }
    // Every assembly path the solver may have factored must agree.
    let mut agr = Agreement { k_rel: 0.0, f_rel: 0.0, worst_k: None, worst_f: None };
    let engines = match eng() {
        Ok(e) => e,
        Err(reason) => return EndToEnd::Uncertified { reason: format!("engine assembly not compared: {reason}") },
    };
    for e in engines {
        match agreement(&model, &e) {
            Ok(a) => {
                if a.k_rel > agr.k_rel || a.k_rel.is_nan() {
                    agr.k_rel = a.k_rel;
                    agr.worst_k = a.worst_k;
                }
                if a.f_rel > agr.f_rel || a.f_rel.is_nan() {
                    agr.f_rel = a.f_rel;
                    agr.worst_f = a.worst_f;
                }
            }
            Err(reason) => return EndToEnd::Failed { reason },
        }
    }
    if !(agr.k_rel <= AGREEMENT_TOL) {
        let w = agr.worst_k.map(|(a, b, e, r)| format!(" at {a:?}–{b:?}: engine {e:.6e}, model [{:.6e}, {:.6e}]", r.lo, r.hi));
        return EndToEnd::Failed {
            reason: format!(
                "the engine's stiffness disagrees with the re-assembled model (relative {:.3e}){}",
                agr.k_rel,
                w.unwrap_or_default()
            ),
        };
    }
    if !(agr.f_rel <= AGREEMENT_TOL) {
        let w = agr.worst_f.map(|(a, e, r)| format!(" at {a:?}: engine {e:.6e}, model [{:.6e}, {:.6e}]", r.lo, r.hi));
        return EndToEnd::Failed {
            reason: format!(
                "the engine's load vector disagrees with the re-assembled model (relative {:.3e}){}",
                agr.f_rel,
                w.unwrap_or_default()
            ),
        };
    }
    EndToEnd::Certified {
        abs_bound: bound.abs_bound,
        rel_bound: bound.rel_bound,
        mu: bound.mu,
        residual_norm: bound.residual_norm,
        k_discrepancy: agr.k_rel,
        f_discrepancy: agr.f_rel,
        excluded_dofs: bound.excluded.into_iter().map(|(node_id, dof)| DofRef { node_id, dof }).collect(),
    }
}

fn lower_csc_to_map(k: &crate::linalg::sparse::CscMatrix) -> std::collections::HashMap<(usize, usize), f64> {
    let mut m = std::collections::HashMap::new();
    for j in 0..k.n {
        for p in k.col_ptr[j]..k.col_ptr[j + 1] {
            let i = k.row_idx[p];
            let v = k.values[p];
            *m.entry((i, j)).or_insert(0.0) += v;
            if i != j {
                *m.entry((j, i)).or_insert(0.0) += v;
            }
        }
    }
    m
}

/// End-to-end check of `results`, claimed to solve `input` with `loads`.
pub fn end_to_end_2d(input: &SolverInput, loads: &[SolverLoad], results: &AnalysisResults) -> EndToEnd {
    end_to_end_2d_with(input, loads, results, || engine_assemblies_2d(input, loads, results))
}

/// `end_to_end_2d` with the engine assemblies to compare against supplied by
/// the caller (tests plant assembly bugs through it).
pub fn end_to_end_2d_with(
    input: &SolverInput,
    loads: &[SolverLoad],
    results: &AnalysisResults,
    engines: impl FnOnce() -> Result<Vec<EngineAssembly>, String>,
) -> EndToEnd {
    let model = model2d::build(input, loads);
    finish(
        model,
        |m| {
            let disp: std::collections::HashMap<usize, &Displacement> =
                results.displacements.iter().map(|d| (d.node_id, d)).collect();
            m.keys
                .iter()
                .map(|&(node, d)| {
                    let x = disp.get(&node).ok_or_else(|| format!("no displacement returned for node {node}"))?;
                    Ok([x.ux, x.uz, x.ry][d])
                })
                .collect()
        },
        engines,
    )
}

/// The engine's assembled K and f of `input` with `loads`: exactly the assembly
/// the solver factored for `results` (`certify::solver_assembly_2d`), for the
/// agreement check. Err when that assembly is too large to read densely.
pub fn engine_assemblies_2d(input: &SolverInput, loads: &[SolverLoad], results: &AnalysisResults) -> Result<Vec<EngineAssembly>, String> {
    use crate::certify::solver::{solver_assembly_2d, SolverAssembly};
    use crate::solver::assembly::{assemble_load_vector_2d, assemble_stiffness_2d};
    use crate::solver::dof::DofNumbering;
    use crate::solver::sparse_assembly::assemble_stiffness_sparse_2d;
    let mut case = input.clone();
    case.loads = loads.to_vec();
    let dof_num = DofNumbering::build_2d(&case);
    let rot = |its: &[crate::solver::assembly::InclinedTransformData2D]| -> Vec<(Vec<usize>, Vec<Vec<f64>>)> {
        its.iter().map(|it| (it.dofs.to_vec(), it.r.iter().map(|r| r.to_vec()).collect())).collect()
    };
    let n = dof_num.n_total;
    Ok(vec![match solver_assembly_2d(&case, results) {
        SolverAssembly::Dense => {
            dense_cap(n)?;
            let st = assemble_stiffness_2d(&case, &dof_num);
            let f = assemble_load_vector_2d(&case, loads, &dof_num, &st.inclined_transforms_2d);
            EngineAssembly { map: dof_num.map.clone(), k: dense_to_map(&st.k, n), f, rotations: rot(&st.inclined_transforms_2d) }
        }
        _ => {
            let stiff = assemble_stiffness_sparse_2d(&case, &dof_num);
            let f = assemble_load_vector_2d(&case, loads, &dof_num, &stiff.inclined_transforms_2d);
            EngineAssembly { map: dof_num.map.clone(), k: lower_csc_to_map(&stiff.k_full), f, rotations: rot(&stiff.inclined_transforms_2d) }
        }
    }])
}

/// Largest dense engine assembly the agreement check reads (the dense
/// certificate's own resource cap, `4 · MAX_CERTIFY_N` DOFs).
const DENSE_AGREEMENT_MAX: usize = 4 * crate::certify::linear::MAX_CERTIFY_N;

fn dense_cap(n: usize) -> Result<(), String> {
    if n > DENSE_AGREEMENT_MAX {
        Err(format!("too large: the solver's dense assembly has {n} DOFs, over the {DENSE_AGREEMENT_MAX} the agreement check reads"))
    } else {
        Ok(())
    }
}

fn dense_to_map(k: &[f64], n: usize) -> std::collections::HashMap<(usize, usize), f64> {
    let mut m = std::collections::HashMap::new();
    for i in 0..n {
        for j in 0..n {
            let v = k[i * n + j];
            if v != 0.0 {
                m.insert((i, j), v);
            }
        }
    }
    m
}

/// End-to-end check of 3D `results`, claimed to solve `input` with `loads`.
pub fn end_to_end_3d(input: &SolverInput3D, loads: &[SolverLoad3D], results: &AnalysisResults3D) -> EndToEnd {
    end_to_end_3d_with(input, loads, results, || engine_assemblies_3d(input, loads))
}

/// 3D twin of `end_to_end_2d_with`.
pub fn end_to_end_3d_with(
    input: &SolverInput3D,
    loads: &[SolverLoad3D],
    results: &AnalysisResults3D,
    engines: impl FnOnce() -> Result<Vec<EngineAssembly>, String>,
) -> EndToEnd {
    let model = model3d::build(input, loads);
    finish(
        model,
        |m| {
            let disp: std::collections::HashMap<usize, &Displacement3D> =
                results.displacements.iter().map(|d| (d.node_id, d)).collect();
            m.keys
                .iter()
                .map(|&(node, d)| {
                    let x = disp.get(&node).ok_or_else(|| format!("no displacement returned for node {node}"))?;
                    Ok([x.ux, x.uy, x.uz, x.rx, x.ry, x.rz][d])
                })
                .collect()
        },
        engines,
    )
}

/// 3D twin of `engine_assemblies_2d` (`certify::solver_assembly_3d`).
pub fn engine_assemblies_3d(input: &SolverInput3D, loads: &[SolverLoad3D]) -> Result<Vec<EngineAssembly>, String> {
    use crate::certify::solver::{solver_assembly_3d, SolverAssembly};
    use crate::solver::assembly::{assemble_load_vector_3d_dense, assemble_sparse_3d, assemble_stiffness_3d, assemble_stiffness_sparse_3d, InclinedTransformData};
    use crate::solver::dof::DofNumbering;
    use crate::solver::sparse_assembly::assemble_load_vector_sparse_3d;
    let mut case = input.clone();
    case.loads = loads.to_vec();
    let dof_num = DofNumbering::build_3d(&case);
    let rot = |its: &[InclinedTransformData]| -> Vec<(Vec<usize>, Vec<Vec<f64>>)> {
        its.iter().map(|it| (it.dofs.to_vec(), it.r.iter().map(|r| r.to_vec()).collect())).collect()
    };
    let n = dof_num.n_total;
    let missing = || "the sparse assembly did not build the full K".to_string();
    Ok(vec![match solver_assembly_3d(&case) {
        SolverAssembly::Dense => {
            dense_cap(n)?;
            let st = assemble_stiffness_3d(&case, &dof_num);
            let f = assemble_load_vector_3d_dense(&case, loads, &dof_num, &st.inclined_transforms);
            EngineAssembly { map: dof_num.map.clone(), k: dense_to_map(&st.k, n), f, rotations: rot(&st.inclined_transforms) }
        }
        SolverAssembly::Sparse => {
            let st = assemble_stiffness_sparse_3d(&case, &dof_num, true);
            let k = lower_csc_to_map(st.k_full.as_ref().ok_or_else(missing)?);
            let f = assemble_load_vector_sparse_3d(&case, loads, &dof_num, &st.inclined_transforms);
            EngineAssembly { map: dof_num.map.clone(), k, f, rotations: rot(&st.inclined_transforms) }
        }
        SolverAssembly::SparseConstrained3D => {
            let st = assemble_sparse_3d(&case, &dof_num, true);
            let k = lower_csc_to_map(st.k_full.as_ref().ok_or_else(missing)?);
            EngineAssembly { map: dof_num.map.clone(), k, f: st.f.clone(), rotations: rot(&st.inclined_transforms) }
        }
    }])
}
