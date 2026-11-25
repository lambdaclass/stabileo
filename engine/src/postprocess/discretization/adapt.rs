//! Adaptive h-refinement of the shell-type elements of a linear static model: solve, estimate
//! the error of every element (`estimate_3d`), split the elements that carry most of it
//! (`refine::refine_marked`), and again, until the estimated relative error is under a target.
//!
//! The elements to split are the fewest whose squared error indicators add up to `fraction` of
//! the total (Dörfler marking), largest first. Elements the estimator cannot estimate (alone in
//! their recovery patches) are never marked. Like the estimate it is driven by, the result is
//! not a certificate.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use super::convergence::governing;
use super::refine::{hanging_nodes, refine_marked, ElementKey, GeometryMode};
use super::{estimate_3d, DiscretizationEstimate, DEFAULT_THRESHOLD};
use crate::types::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AdaptOptions {
    /// Estimated relative energy-norm error to stop at.
    pub target: f64,
    /// Share of the squared error the elements split in one pass carry, in (0, 1].
    pub fraction: f64,
    /// At most `MOST_PASSES`.
    pub max_passes: usize,
    /// A pass that would leave more shell-type elements than this is not made. At most
    /// `MOST_ELEMENTS`.
    pub max_elements: usize,
    pub geometry: GeometryMode,
}

pub const MOST_PASSES: usize = 50;
pub const MOST_ELEMENTS: usize = 200_000;

impl Default for AdaptOptions {
    fn default() -> Self {
        AdaptOptions { target: DEFAULT_THRESHOLD, fraction: 0.5, max_passes: 8, max_elements: 20_000, geometry: GeometryMode::default() }
    }
}

/// One solve of the sequence.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdaptPass {
    pub shell_elements: usize,
    pub nodes: usize,
    pub hanging_nodes: usize,
    /// None when the mesh of this pass could not be estimated.
    pub relative_error: Option<f64>,
    /// Elements marked for the next pass; zero on the last.
    pub marked: usize,
}

/// A governing quantity (see `convergence`) on the model as given and on the last one solved.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdaptedQuantity {
    pub quantity: String,
    /// The first node of the support group, for a reaction.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_id: Option<usize>,
    pub model: f64,
    /// None when the quantity did not carry over to the refined mesh.
    pub adapted: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Adapted {
    /// Always false: the estimate that drives the refinement is not a bound.
    pub certified: bool,
    /// The last model solved.
    pub input: SolverInput3D,
    /// The estimate of that model.
    pub estimate: DiscretizationEstimate,
    pub passes: Vec<AdaptPass>,
    pub quantities: Vec<AdaptedQuantity>,
    /// `converged` (the estimate is at or under the target), `passLimit`, `elementLimit`,
    /// `unestimable` (see the estimate's `unestimableReason`) or `nothingToRefine` (over the
    /// target with no element the estimator can point at).
    pub status: String,
    /// The refinement caveats of every pass (see `refine::Refined`).
    pub caveats: Vec<String>,
    pub supports_inferred: usize,
}

fn shell_elements(input: &SolverInput3D) -> usize {
    input.plates.len() + input.quads.len() + input.quad9s.len() + input.curved_shells.len() + input.solid_shells.len()
}

fn family(kind: &str) -> Option<&'static str> {
    ["plate", "quad", "quad9", "curvedShell", "solidShell"].into_iter().find(|tag| *tag == kind)
}

/// The fewest estimated elements whose squared indicators reach `fraction` of the total, largest
/// first (ties by family and id).
pub fn marked(estimate: &DiscretizationEstimate, fraction: f64) -> HashSet<ElementKey> {
    let mut ranked: Vec<(f64, ElementKey)> = estimate
        .elements
        .iter()
        .filter(|e| e.local_percent.is_some() && e.eta > 0.0)
        .filter_map(|e| Some((e.eta * e.eta, (family(&e.kind)?, e.element_id))))
        .collect();
    ranked.sort_by(|a, b| b.0.total_cmp(&a.0).then(a.1.cmp(&b.1)));
    let total: f64 = ranked.iter().map(|(eta2, _)| eta2).sum();
    let mut reached = 0.0;
    let mut out = HashSet::new();
    for (eta2, element) in ranked {
        if reached >= fraction * total {
            break;
        }
        reached += eta2;
        out.insert(element);
    }
    out
}

pub fn adapt_3d(input: &SolverInput3D, options: &AdaptOptions) -> Result<Adapted, String> {
    if !(options.target.is_finite() && options.target > 0.0) {
        return Err("The target error must be finite and positive".into());
    }
    if !(options.fraction > 0.0 && options.fraction <= 1.0) {
        return Err("The marked fraction must be over 0 and at most 1".into());
    }
    if options.max_passes > MOST_PASSES {
        return Err(format!("At most {MOST_PASSES} passes"));
    }
    if options.max_elements > MOST_ELEMENTS {
        return Err(format!("At most {MOST_ELEMENTS} shell elements"));
    }
    let mut model = input.clone();
    let mut passes = Vec::new();
    let mut caveats: Vec<String> = Vec::new();
    let mut supports_inferred = 0;
    let original_max_node = input.nodes.values().map(|n| n.id).max().unwrap_or(0);
    let mut as_given = None;
    loop {
        let results = crate::solver::linear::solve_3d(&model)?;
        let estimate = estimate_3d(&model, &results)?;
        let now = governing(&model, &results, original_max_node);
        let quantities: Vec<AdaptedQuantity> = as_given
            .get_or_insert_with(|| now.clone())
            .iter()
            .map(|(key, &model)| AdaptedQuantity {
                quantity: key.0.clone(),
                node_id: (key.0 == "reaction").then_some(key.1),
                model,
                adapted: now.get(key).copied().filter(|v| v.is_finite()),
            })
            .collect();
        let mut pass = AdaptPass {
            shell_elements: shell_elements(&model),
            nodes: model.nodes.len(),
            hanging_nodes: hanging_nodes(&model).map_or(0, |h| h.len()),
            relative_error: estimate.relative_error,
            marked: 0,
        };
        let done = |status: &str, pass: AdaptPass, mut passes: Vec<AdaptPass>, model: SolverInput3D, caveats: Vec<String>| {
            passes.push(pass);
            Ok(Adapted { certified: false, input: model, estimate: estimate.clone(), passes, quantities: quantities.clone(), status: status.into(), caveats, supports_inferred })
        };
        let Some(relative_error) = estimate.relative_error else {
            return done("unestimable", pass, passes, model, caveats);
        };
        if relative_error <= options.target {
            return done("converged", pass, passes, model, caveats);
        }
        if passes.len() >= options.max_passes {
            return done("passLimit", pass, passes, model, caveats);
        }
        let to_split = marked(&estimate, options.fraction);
        if to_split.is_empty() {
            return done("nothingToRefine", pass, passes, model, caveats);
        }
        let refined = refine_marked(&model, options.geometry, &to_split)?;
        if shell_elements(&refined.input) > options.max_elements {
            return done("elementLimit", pass, passes, model, caveats);
        }
        pass.marked = to_split.len();
        passes.push(pass);
        for caveat in refined.caveats {
            if !caveats.contains(&caveat) {
                caveats.push(caveat);
            }
        }
        supports_inferred += refined.supports_inferred;
        model = refined.input;
    }
}
