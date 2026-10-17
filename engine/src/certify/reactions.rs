//! Certified bounds on the support reactions. See "Diagrams, extremes,
//! deflections and reactions" in `docs/verification/CERTIFY.md`.
//!
//! The solvers report, per support component with global DOF d,
//!
//!   restrained d:          R = (K u − f)_d = Σ_j K_dj u_j − f_d
//!   free d with spring k:  R = −k·u_d
//!
//! (`build_reactions_2d/3d`), with K and f the assembly the certificate checks.
//! So `|R(u*) − R(ũ)| ≤ ‖K_{d,F}‖₂·‖u* − ũ‖₂` (restrained; the restrained
//! displacements are prescribed, hence exact) or `|k|·‖u* − ũ‖₂` (spring). The
//! reported value is also compared with the formula evaluated at ũ in interval
//! arithmetic, and the difference added: unlike member forces, the reaction
//! bound covers the f64 evaluation too, and any disagreement between the
//! reported reaction and the formula widens it rather than hides.
//!
//! Not bounded: models with constraints or inclined supports (their reactions
//! go through transformed systems), 2D springs with an angle, nodes carrying
//! more than one support, the warping bimoment reaction.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::forces::up;
use super::interval::Interval;
use super::solver::{gather_u_2d, gather_u_3d};
use crate::linalg::sparse::CscMatrix;
use crate::solver::assembly::{assemble_load_vector_2d, assemble_load_vector_3d_dense, assemble_stiffness_2d, assemble_stiffness_3d, assemble_stiffness_sparse_3d};
use crate::solver::dof::DofNumbering;
use crate::solver::linear::{expand_curved_beams_3d, SPARSE_THRESHOLD};
use crate::solver::sparse_assembly::{assemble_load_vector_sparse_3d, assemble_stiffness_sparse_2d};
use crate::types::*;

/// Bounds on |exact − reported| of one node's reactions (kN, kN·m).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReactionBound2D {
    pub node_id: usize,
    pub rx: f64,
    pub rz: f64,
    pub my: f64,
}

/// Bounds on |exact − reported| of one node's reactions, global axes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReactionBound3D {
    pub node_id: usize,
    pub fx: f64,
    pub fy: f64,
    pub fz: f64,
    pub mx: f64,
    pub my: f64,
    pub mz: f64,
}

/// The rows of the assembled K at the restrained DOFs, as (column, value).
pub(crate) struct RestrainedRows {
    nf: usize,
    rows: HashMap<usize, Vec<(usize, f64)>>,
}

impl RestrainedRows {
    fn dense(k: &[f64], n: usize, nf: usize) -> Self {
        let rows = (nf..n)
            .map(|d| (d, (0..n).filter(|&j| k[d * n + j] != 0.0).map(|j| (j, k[d * n + j])).collect()))
            .collect();
        RestrainedRows { nf, rows }
    }

    /// From the lower-triangle CSC of the full symmetric K.
    fn sparse_lower(k: &CscMatrix, nf: usize) -> Self {
        let mut rows: HashMap<usize, Vec<(usize, f64)>> = HashMap::new();
        for j in 0..k.n {
            for p in k.col_ptr[j]..k.col_ptr[j + 1] {
                let (i, v) = (k.row_idx[p], k.values[p]);
                if v == 0.0 {
                    continue;
                }
                if i >= nf {
                    rows.entry(i).or_default().push((j, v));
                }
                if j >= nf && i != j {
                    rows.entry(j).or_default().push((i, v));
                }
            }
        }
        RestrainedRows { nf, rows }
    }

    /// (‖K_{d,F}‖₂ rounded up, enclosure of (K u − f)_d).
    fn row(&self, d: usize, u: &[f64], f: &[f64]) -> (f64, Interval) {
        let mut sq = 0.0f64;
        let mut acc = -Interval::point(f.get(d).copied().unwrap_or(0.0));
        for &(j, v) in self.rows.get(&d).map(Vec::as_slice).unwrap_or(&[]) {
            if j < self.nf {
                sq = up(sq + up(v * v));
            }
            acc = acc + Interval::point(v) * Interval::point(u[j]);
        }
        (up(sq.sqrt()), acc)
    }
}

/// One support component: its DOF (None: not in the model), spring stiffness,
/// and the reported reaction.
struct Component {
    dof: Option<usize>,
    spring: f64,
    spring_type: bool,
    reported: f64,
}

fn component_bound(c: &Component, k: &RestrainedRows, u: &[f64], f: &[f64], abs_bound: f64) -> f64 {
    let (disp, value) = match c.dof {
        None => (0.0, Interval::ZERO),
        Some(d) if c.spring_type || d < k.nf => {
            // R = −k·u_d (a free DOF without a spring reports 0, k = 0).
            let kk = if c.spring_type || c.spring > 0.0 { c.spring } else { 0.0 };
            let disp = if d < k.nf { up(kk.abs() * abs_bound) } else { 0.0 };
            (disp, -(Interval::point(kk) * Interval::point(u[d])))
        }
        Some(d) => {
            let (r, value) = k.row(d, u, f);
            (up(r * abs_bound), value)
        }
    };
    let dev = (value - Interval::point(c.reported)).mag();
    let b = up(disp + dev);
    if b.is_finite() { b } else { f64::INFINITY }
}

/// Supports by node, None for a node with several (ambiguous reactions).
fn single_support_nodes<S>(supports: impl Iterator<Item = (usize, S)>) -> Vec<(usize, S)> {
    let mut by: HashMap<usize, Vec<S>> = HashMap::new();
    for (n, s) in supports {
        by.entry(n).or_default().push(s);
    }
    let mut out: Vec<(usize, S)> =
        by.into_iter().filter(|(_, v)| v.len() == 1).map(|(n, mut v)| (n, v.pop().unwrap())).collect();
    out.sort_by_key(|x| x.0);
    out
}

/// The restrained rows of the K the certificate checks for this 2D model.
pub(crate) fn restrained_rows_2d(input: &SolverInput) -> Result<(DofNumbering, RestrainedRows), String> {
    if !input.constraints.is_empty() || input.supports.values().any(|s| s.support_type == "inclinedRoller") {
        return Err("reactions not bounded: constraints or inclined supports".into());
    }
    let dof = DofNumbering::build_2d(input);
    let rows = if dof.n_free >= SPARSE_THRESHOLD {
        let st = assemble_stiffness_sparse_2d(input, &dof);
        RestrainedRows::sparse_lower(&st.k_full, dof.n_free)
    } else {
        let st = assemble_stiffness_2d(input, &dof);
        RestrainedRows::dense(&st.k, dof.n_total, dof.n_free)
    };
    Ok((dof, rows))
}

/// Per-node reaction bounds of a 2D solve with loads `loads` (results of the
/// structure `input`), given `‖u* − ũ‖₂ ≤ abs_bound`.
pub fn reaction_bounds_2d(
    input: &SolverInput,
    loads: &[SolverLoad],
    results: &AnalysisResults,
    abs_bound: f64,
) -> Result<Vec<ReactionBound2D>, String> {
    let (dof, rows) = restrained_rows_2d(input)?;
    reaction_bounds_2d_with(input, &dof, &rows, loads, results, abs_bound)
}

pub(crate) fn reaction_bounds_2d_with(
    input: &SolverInput,
    dof: &DofNumbering,
    rows: &RestrainedRows,
    loads: &[SolverLoad],
    results: &AnalysisResults,
    abs_bound: f64,
) -> Result<Vec<ReactionBound2D>, String> {
    let f = assemble_load_vector_2d(input, loads, dof, &[]);
    let u = gather_u_2d(dof, &results.displacements).map_err(|c| format!("{c:?}"))?;
    let reported: HashMap<usize, &Reaction> = results.reactions.iter().map(|r| (r.node_id, r)).collect();
    let mut out = Vec::new();
    for (node, sup) in single_support_nodes(input.supports.values().map(|s| (s.node_id, s))) {
        let spring_type = sup.support_type == "spring";
        let angled = sup.angle.is_some_and(|a| a.abs() > 1e-15)
            && (sup.kx.unwrap_or(0.0) > 0.0 || sup.ky.unwrap_or(0.0) > 0.0);
        if spring_type && angled {
            continue;
        }
        let Some(r) = reported.get(&node) else { continue };
        let springs = [sup.kx, sup.ky, sup.kz];
        let rep = [r.rx, r.rz, r.my];
        let b: Vec<f64> = (0..3)
            .map(|i| {
                let c = Component {
                    dof: if i < dof.dofs_per_node { dof.map.get(&(node, i)).copied() } else { None },
                    spring: springs[i].unwrap_or(0.0),
                    spring_type,
                    reported: rep[i],
                };
                component_bound(&c, rows, &u, &f, abs_bound)
            })
            .collect();
        out.push(ReactionBound2D { node_id: node, rx: b[0], rz: b[1], my: b[2] });
    }
    Ok(out)
}

/// The restrained rows and load assembly the certificate uses for this 3D model
/// (already passed through `expand_curved_beams_3d`).
pub(crate) fn restrained_rows_3d(input: &SolverInput3D) -> Result<(DofNumbering, RestrainedRows, bool), String> {
    if !input.constraints.is_empty() || input.supports.values().any(|s| s.is_inclined.unwrap_or(false)) {
        return Err("reactions not bounded: constraints or inclined supports".into());
    }
    let dof = DofNumbering::build_3d(input);
    let sparse = dof.n_free >= SPARSE_THRESHOLD;
    let rows = if sparse {
        let st = assemble_stiffness_sparse_3d(input, &dof, true);
        let Some(k) = st.k_full.as_ref() else { return Err("sparse assembly did not build the full K".into()) };
        RestrainedRows::sparse_lower(k, dof.n_free)
    } else {
        let st = assemble_stiffness_3d(input, &dof);
        RestrainedRows::dense(&st.k, dof.n_total, dof.n_free)
    };
    Ok((dof, rows, sparse))
}

/// Per-node reaction bounds of a 3D solve (see [`reaction_bounds_2d`]).
pub fn reaction_bounds_3d(
    input: &SolverInput3D,
    loads: &[SolverLoad3D],
    results: &AnalysisResults3D,
    abs_bound: f64,
) -> Result<Vec<ReactionBound3D>, String> {
    let input = &expand_curved_beams_3d(input);
    let (dof, rows, sparse) = restrained_rows_3d(input)?;
    reaction_bounds_3d_with(input, &dof, &rows, sparse, loads, results, abs_bound)
}

pub(crate) fn reaction_bounds_3d_with(
    input: &SolverInput3D,
    dof: &DofNumbering,
    rows: &RestrainedRows,
    sparse: bool,
    loads: &[SolverLoad3D],
    results: &AnalysisResults3D,
    abs_bound: f64,
) -> Result<Vec<ReactionBound3D>, String> {
    let f = if sparse {
        assemble_load_vector_sparse_3d(input, loads, dof, &[])
    } else {
        assemble_load_vector_3d_dense(input, loads, dof, &[])
    };
    let u = gather_u_3d(dof, &results.displacements).map_err(|c| format!("{c:?}"))?;
    let reported: HashMap<usize, &Reaction3D> = results.reactions.iter().map(|r| (r.node_id, r)).collect();
    let mut out = Vec::new();
    for (node, sup) in single_support_nodes(input.supports.values().map(|s| (s.node_id, s))) {
        let Some(r) = reported.get(&node) else { continue };
        let springs = [sup.kx, sup.ky, sup.kz, sup.krx, sup.kry, sup.krz];
        let rep = [r.fx, r.fy, r.fz, r.mx, r.my, r.mz];
        let b: Vec<f64> = (0..6)
            .map(|i| {
                let c = Component {
                    dof: if i < dof.dofs_per_node { dof.map.get(&(node, i)).copied() } else { None },
                    spring: springs[i].unwrap_or(0.0),
                    spring_type: false,
                    reported: rep[i],
                };
                component_bound(&c, rows, &u, &f, abs_bound)
            })
            .collect();
        out.push(ReactionBound3D { node_id: node, fx: b[0], fy: b[1], fz: b[2], mx: b[3], my: b[4], mz: b[5] });
    }
    Ok(out)
}
