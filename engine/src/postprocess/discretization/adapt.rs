//! Adaptive h-refinement of the shell-type elements of a linear static model: solve, estimate
//! the error of every element (`estimate_3d`), split the elements that carry most of it
//! (`refine::refine_marked`), and again, until the estimated relative error is under a target.
//!
//! The elements to split are the fewest whose squared error indicators add up to `fraction` of
//! the total (Dörfler marking), largest first. Elements the estimator cannot estimate (alone in
//! their recovery patches) are never marked. Like the estimate it is driven by, the result is
//! not a certificate.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use super::convergence::governing;
use super::refine::{hanging_nodes, refine_marked, ElementKey, GeometryMode, Refined};
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
    /// How `input` was made from the model given, in that model's ids.
    pub mesh: AdaptedMesh,
}

/// The last mesh as changes to the first: enough to refine a model that holds more than the
/// solver is given (the app's) the same way.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdaptedMesh {
    /// The nodes added, by id.
    pub nodes: Vec<MeshNode>,
    /// The elements that stand where each split shell-type element stood.
    pub shells: Vec<MeshShell>,
    /// The frame members split.
    pub frames: Vec<MeshFrame>,
    /// The supports given to added nodes.
    pub supports: Vec<MeshSupport>,
    /// The terms of every linear constraint of the last model: those of its hanging nodes.
    pub constraints: Vec<Vec<MPCTerm>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshNode {
    pub id: usize,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    /// The ends of the edge it was put on; none for a node inside an element.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub between: Option<[usize; 2]>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshShell {
    pub family: String,
    /// The element of the model given that it is a part of.
    pub parent: usize,
    pub id: usize,
    pub nodes: Vec<usize>,
    /// One row per corner: the weights of the parent's corners there (see `refine::Split`).
    pub weights: Vec<Vec<f64>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshFrame {
    pub parent: usize,
    /// The nodes added along it from end I to end J, and how far along each is (0 to 1, by
    /// halving: a node off the chord is still counted at the middle of its piece).
    pub nodes: Vec<usize>,
    pub at: Vec<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshSupport {
    pub node_id: usize,
    /// Restrained translations along x, y, z and rotations about them.
    pub restrained: [bool; 6],
    /// Whether it is no more than those restraints: no imposed displacement, not inclined.
    pub plain: bool,
}

/// What each element of the current model descends from, kept from pass to pass.
#[derive(Default)]
struct Lineage {
    /// Current element → the original it is a part of, and its corner weights there.
    shells: HashMap<ElementKey, (usize, Vec<Vec<f64>>)>,
    /// Original member → its pieces from end I to end J: (current id, parameter at its end J).
    frames: HashMap<usize, Vec<(usize, f64, usize)>>,
    frame_of: HashMap<usize, usize>,
    between: HashMap<usize, [usize; 2]>,
}

fn times(child: &[Vec<f64>], parent: &[Vec<f64>]) -> Vec<Vec<f64>> {
    if child.is_empty() || parent.is_empty() {
        return Vec::new();
    }
    child
        .iter()
        .map(|row| (0..parent[0].len()).map(|corner| row.iter().zip(parent).map(|(w, of)| w * of[corner]).sum()).collect())
        .collect()
}

impl Lineage {
    fn record(&mut self, refined: &Refined) {
        for split in &refined.splits {
            let own = self.shells.remove(&(split.family, split.parent));
            for (child, weights) in &split.children {
                let entry = match &own {
                    Some((original, within)) => (*original, times(weights, within)),
                    None => (split.parent, weights.clone()),
                };
                self.shells.insert((split.family, *child), entry);
            }
        }
        for &(parent, [first, second], mid) in &refined.frame_splits {
            let original = self.frame_of.remove(&parent).unwrap_or(parent);
            let pieces = self.frames.entry(original).or_insert_with(|| vec![(parent, 1.0, usize::MAX)]);
            let Some(at) = pieces.iter().position(|piece| piece.0 == parent) else { continue };
            let (_, end, end_node) = pieces[at];
            let start = if at == 0 { 0.0 } else { pieces[at - 1].1 };
            pieces.splice(at..=at, [(first, 0.5 * (start + end), mid), (second, end, end_node)]);
            self.frame_of.insert(first, original);
            self.frame_of.insert(second, original);
        }
        for (node, parents) in &refined.created {
            if let [a, b] = parents.as_slice() {
                self.between.insert(*node, [*a, *b]);
            }
        }
    }

    fn mesh(&self, model: &SolverInput3D, original_max_node: usize) -> AdaptedMesh {
        let mut nodes: Vec<MeshNode> = model
            .nodes
            .values()
            .filter(|n| n.id > original_max_node)
            .map(|n| MeshNode { id: n.id, x: n.x, y: n.y, z: n.z, between: self.between.get(&n.id).copied() })
            .collect();
        nodes.sort_by_key(|n| n.id);
        let corners = |family: &str, id: usize| -> Option<Vec<usize>> {
            let key = id.to_string();
            Some(match family {
                "plate" => model.plates.get(&key)?.nodes.to_vec(),
                "quad" => model.quads.get(&key)?.nodes.to_vec(),
                "quad9" => model.quad9s.get(&key)?.nodes.to_vec(),
                "curvedShell" => model.curved_shells.get(&key)?.nodes.to_vec(),
                _ => model.solid_shells.get(&key)?.nodes.to_vec(),
            })
        };
        let mut shells: Vec<MeshShell> = self
            .shells
            .iter()
            .filter_map(|(&(family, id), (parent, weights))| {
                Some(MeshShell { family: family.into(), parent: *parent, id, nodes: corners(family, id)?, weights: weights.clone() })
            })
            .collect();
        shells.sort_by(|a, b| (&a.family, a.parent, a.id).cmp(&(&b.family, b.parent, b.id)));
        let mut frames: Vec<MeshFrame> = self
            .frames
            .iter()
            .map(|(&parent, pieces)| {
                let inner = &pieces[..pieces.len() - 1];
                MeshFrame { parent, nodes: inner.iter().map(|p| p.2).collect(), at: inner.iter().map(|p| p.1).collect() }
            })
            .collect();
        frames.sort_by_key(|f| f.parent);
        let mut supports: Vec<MeshSupport> = model
            .supports
            .values()
            .filter(|s| s.node_id > original_max_node)
            .map(|s| MeshSupport {
                node_id: s.node_id,
                restrained: [s.rx, s.ry, s.rz, s.rrx, s.rry, s.rrz],
                plain: s.is_inclined != Some(true) && [s.dx, s.dy, s.dz, s.drx, s.dry, s.drz].iter().all(|d| d.is_none_or(|v| v == 0.0)),
            })
            .collect();
        supports.sort_by_key(|s| s.node_id);
        let constraints = model
            .constraints
            .iter()
            .filter_map(|c| match c {
                Constraint::LinearMPC(mpc) => Some(mpc.terms.clone()),
                _ => None,
            })
            .collect();
        AdaptedMesh { nodes, shells, frames, supports, constraints }
    }
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
    let mut lineage = Lineage::default();
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
            let mesh = lineage.mesh(&model, original_max_node);
            Ok(Adapted { certified: false, input: model, estimate: estimate.clone(), passes, quantities: quantities.clone(), status: status.into(), caveats, supports_inferred, mesh })
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
        lineage.record(&refined);
        for caveat in refined.caveats {
            if !caveats.contains(&caveat) {
                caveats.push(caveat);
            }
        }
        supports_inferred += refined.supports_inferred;
        model = refined.input;
    }
}
