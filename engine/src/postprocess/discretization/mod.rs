//! Discretization (mesh) error: estimated, never certified.
//!
//! The certificates (`crate::certify`, docs/verification/CERTIFY.md) bound how far the computed
//! displacements are from the exact solution of the *assembled* system `K u = f`. They say
//! nothing about how far that system's solution is from the solution of the structure the mesh
//! stands for. A coarse shell mesh can be certified to twelve digits and still be wrong by 30 %.
//! This module estimates that second error (docs/verification/DISCRETIZATION.md):
//!
//! * `estimate_3d`: a recovery-based a posteriori estimate (Zienkiewicz–Zhu with
//!   superconvergent patch recovery) of the energy-norm error of every shell-type element and of
//!   the whole model, from one solve.
//! * `convergence::convergence_study_3d`: re-solves on uniformly refined meshes and reports how
//!   the governing quantities move, with a Richardson extrapolation and its observed order.
//!
//! Frame members carry no discretization error of this kind: their stiffness is the exact
//! (Euler–Bernoulli or Timoshenko) beam stiffness and member loads enter through exact fixed-end
//! forces, so nodal displacements and member forces are exact for beam theory, however few the
//! members. The estimate says so (`framesExact`) only when it holds for every member: members
//! with warping torsion (Cw > 0, cubic Hermite warping field) and curved beams (straight
//! segments) are approximate, and are listed as not estimated instead.

pub mod convergence;
pub mod recovery;
pub mod refine;
pub mod samples;

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::types::*;
use samples::{energy_density, to_local};

/// Above this estimated relative error a result is flagged (energy norm, or change in a
/// governing quantity).
pub const DEFAULT_THRESHOLD: f64 = 0.05;

/// Error indicator of one element.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementErrorIndicator {
    /// `plate`, `quad`, `quad9`, `curvedShell` or `solidShell`.
    pub kind: String,
    pub element_id: usize,
    /// Estimated energy-norm error of the element, ‖σ* − σ_h‖ (√(kN·m)).
    pub eta: f64,
    /// The element's own energy norm ‖σ_h‖ over the same components.
    pub energy_norm: f64,
    /// η_e relative to the mean element share of the total energy, √((U + η²)/N), in percent.
    /// Uniformly spread error gives every element the global percentage; an element above the
    /// threshold is where refinement pays. None when not estimated (the element is alone in its
    /// recovery patches, or the model's estimate could not be made): never a 0 standing in for
    /// "unknown".
    pub local_percent: Option<f64>,
}

/// Recovery-based estimate of the discretization error of a linear static solution.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscretizationEstimate {
    /// Always false: this is an estimate, not a bound. Kept in the payload so no consumer can
    /// mistake it for a certificate.
    pub certified: bool,
    /// `zz-spr`: Zienkiewicz–Zhu estimator with superconvergent patch recovery.
    pub method: String,
    /// Estimated relative energy-norm error η / √(‖u_h‖² + η²) of the shell-type elements;
    /// None when the model has none, or when it cannot be estimated (`unestimable_reason`):
    /// a 0/0 is never reported as "no error".
    pub relative_error: Option<f64>,
    /// Why the shells' error could not be estimated: `unloaded` (no load, nothing to estimate)
    /// or `noStrainEnergy` (loaded, but the mesh carries no strain above round-off — e.g. a
    /// single simply supported element whose load goes straight into its supports: the mesh is
    /// too coarse to say anything, refine it) or `tooCoarse` (no element shares a node with
    /// another of its kind, so no patch is larger than the element itself) or `nonFinite` (the
    /// stress field holds NaN or infinity: a NaN ratio compares false against every threshold
    /// and would read as small). None when estimated or when there are no shells.
    pub unestimable_reason: Option<String>,
    /// Estimated energy-norm error η (√(kN·m)).
    pub error_norm: f64,
    /// Energy norm of the computed solution over the same (estimated, non-isolated) elements
    /// and components.
    pub solution_norm: f64,
    pub threshold: f64,
    pub exceeds_threshold: bool,
    pub elements: Vec<ElementErrorIndicator>,
    /// Number of frame members.
    pub frame_members: usize,
    /// Members whose discretization error is neither zero nor estimated: members with warping
    /// torsion (section Cw > 0), whose warping field is a cubic Hermite approximation.
    pub inexact_members: Vec<usize>,
    /// Shell elements alone in every recovery patch (a lone element, or one separated from its
    /// neighbours by folds or changes of section): not estimated, and left out of
    /// `relative_error`. When they carry more than 0.1 % of the strain energy the result is
    /// flagged.
    pub isolated_elements: Vec<usize>,
    /// Codes of what the estimate does and does not cover (see DISCRETIZATION.md):
    /// `notCertified`, `transverseShearExcluded`, `framesExact` (every member exact),
    /// `warpingMembersNotEstimated`, `curvedBeamsSegmented`, `noShellElements`,
    /// `isolatedElementsNotEstimated`.
    pub notes: Vec<String>,
}

/// Element and global energy-norm error of the computed stress field against the recovered one.
pub(crate) struct RawEstimate {
    pub per_element: Vec<(samples::Family, usize, f64, f64)>, // (family, id, η², U)
    /// Σ E·V over the sampled elements: the energy of a unit strain everywhere.
    pub energy_scale: f64,
    /// Per element (aligned with `per_element`): alone in every recovery patch, so its
    /// recovered field is its own and its indicator says nothing.
    pub isolated: Vec<bool>,
}

/// Whether anything loads the model: a nonzero reaction or displacement (loads that go straight
/// into the supports still show as reactions).
fn is_loaded(results: &AnalysisResults3D) -> bool {
    let nonzero = |v: &[f64]| v.iter().any(|x| *x != 0.0);
    results.reactions.iter().any(|r| nonzero(&[r.fx, r.fy, r.fz, r.mx, r.my, r.mz]))
        || results.displacements.iter().any(|d| nonzero(&[d.ux, d.uy, d.uz, d.rx, d.ry, d.rz]))
}

pub(crate) fn raw_estimate(input: &SolverInput3D, results: &AnalysisResults3D) -> Result<RawEstimate, String> {
    let elems = samples::sample_elements(input, results)?;
    let coords: HashMap<usize, [f64; 3]> = input.nodes.values().map(|n| (n.id, [n.x, n.y, n.z])).collect();
    let patches = recovery::patches(&elems);
    let rec = recovery::recover(&elems, &coords, &patches);
    let isolated = recovery::isolated(&elems, &patches);
    let mut per_element = Vec::with_capacity(elems.len());
    let energy_scale: f64 = elems.iter().map(|e| e.e * e.samples.iter().map(|s| s.weight).sum::<f64>()).sum();
    for (e, nodal) in elems.iter().zip(&rec) {
        let (mut eta2, mut u) = (0.0, 0.0);
        for s in &e.samples {
            let mut g = [0.0; 6];
            for (i, (a0, a1)) in nodal.iter().enumerate() {
                for k in 0..6 {
                    g[k] += s.shape[i] * (a0[k] + a1[k] * s.zeta);
                }
            }
            let star = to_local(&s.frame, &g);
            let d = [star[0] - s.sigma[0], star[1] - s.sigma[1], star[2] - s.sigma[2]];
            eta2 += energy_density(&d, e.e, e.nu) * s.weight;
            u += energy_density(&s.sigma, e.e, e.nu) * s.weight;
        }
        per_element.push((e.family, e.id, eta2, u));
    }
    Ok(RawEstimate { per_element, energy_scale, isolated })
}

/// Estimate the discretization error of a 3D linear static solution of `input`.
pub fn estimate_3d(input: &SolverInput3D, results: &AnalysisResults3D) -> Result<DiscretizationEstimate, String> {
    let raw = raw_estimate(input, results)?;
    // Elements alone in every recovery patch carry no estimate (their recovered field is their
    // own): the global figure is over the others, and the isolated ones are listed.
    let estimated = |i: usize| !raw.isolated[i];
    let sum = |f: &dyn Fn(usize) -> f64, pick: &dyn Fn(usize) -> bool| -> f64 {
        (0..raw.per_element.len()).filter(|&i| pick(i)).map(f).sum()
    };
    let eta2 = sum(&|i| raw.per_element[i].2, &estimated);
    let u = sum(&|i| raw.per_element[i].3, &estimated);
    let u_all = sum(&|i| raw.per_element[i].3, &|_| true);
    let u_isolated = u_all - u;
    let n = raw.per_element.len();
    let n_estimated = (0..n).filter(|&i| estimated(i)).count();
    let isolated_elements: Vec<usize> = (0..n).filter(|&i| !estimated(i)).map(|i| raw.per_element[i].1).collect();
    let mut notes = vec!["notCertified".to_string()];
    let mut unestimable_reason = None;
    // Strain energy below what a strain of 1e-12 (round-off) everywhere would store is no
    // energy at all: a ratio of it would be 0/0.
    let floor = 1e-24 * raw.energy_scale;
    let relative_error = if n > 0 {
        notes.push("transverseShearExcluded".into());
        if ![eta2, u_all, floor].iter().all(|v| v.is_finite()) {
            unestimable_reason = Some("nonFinite".to_string());
            None
        } else if u_all + eta2 <= floor {
            unestimable_reason = Some(if is_loaded(results) { "noStrainEnergy" } else { "unloaded" }.to_string());
            None
        } else if n_estimated == 0 || u + eta2 <= floor {
            // Every strained element alone in its patches (a one-element mesh, or elements
            // separated by folds sharper than the crease angle): estimates would be ≈ 0 by
            // construction and say nothing.
            unestimable_reason = Some("tooCoarse".to_string());
            None
        } else {
            Some((eta2 / (u + eta2)).sqrt())
        }
    } else {
        notes.push("noShellElements".into());
        None
    };
    // Isolated elements that carry a non-negligible share of the strain energy are an
    // unestimated part of the answer: flagged, not folded into a reassuring figure.
    let isolated_significant = relative_error.is_some() && u_isolated > 1e-3 * u_all;
    if !isolated_elements.is_empty() {
        notes.push("isolatedElementsNotEstimated".into());
    }
    let frame_members = input.elements.len();
    let sections: HashMap<usize, &SolverSection3D> = input.sections.values().map(|s| (s.id, s)).collect();
    let mut inexact_members: Vec<usize> = input
        .elements
        .values()
        .filter(|e| e.elem_type != "truss" && sections.get(&e.section_id).is_some_and(|s| s.cw.is_some_and(|cw| cw > 0.0)))
        .map(|e| e.id)
        .collect();
    inexact_members.sort_unstable();
    if !inexact_members.is_empty() {
        notes.push("warpingMembersNotEstimated".into());
    }
    if !input.curved_beams.is_empty() {
        notes.push("curvedBeamsSegmented".into());
    }
    if frame_members > 0 && inexact_members.is_empty() && input.curved_beams.is_empty() {
        notes.push("framesExact".into());
    }
    let mean = if n_estimated > 0 { ((u + eta2) / n_estimated as f64).sqrt() } else { 0.0 };
    let elements = raw
        .per_element
        .iter()
        .enumerate()
        .map(|(i, &(fam, id, e2, ue))| ElementErrorIndicator {
            kind: fam.name().to_string(),
            element_id: id,
            eta: e2.sqrt(),
            energy_norm: ue.sqrt(),
            local_percent: (relative_error.is_some() && estimated(i) && mean > 0.0).then(|| 100.0 * e2.sqrt() / mean),
        })
        .collect();
    let threshold = DEFAULT_THRESHOLD;
    Ok(DiscretizationEstimate {
        certified: false,
        method: "zz-spr".into(),
        // A loaded mesh too coarse to estimate, or a non-finite field, is flagged like one above
        // the threshold.
        exceeds_threshold: relative_error.is_some_and(|r| r > threshold)
            || matches!(unestimable_reason.as_deref(), Some("noStrainEnergy" | "tooCoarse" | "nonFinite"))
            || isolated_significant,
        relative_error,
        unestimable_reason,
        error_norm: eta2.sqrt(),
        solution_norm: u.sqrt(),
        threshold,
        elements,
        frame_members,
        inexact_members,
        isolated_elements,
        notes,
    })
}

/// Solve a 3D model (linear static) and estimate its discretization error.
pub fn solve_and_estimate_3d(input: &SolverInput3D) -> Result<DiscretizationEstimate, String> {
    let results = crate::solver::linear::solve_3d(input)?;
    estimate_3d(input, &results)
}
