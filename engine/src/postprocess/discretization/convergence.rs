//! Automatic convergence check: re-solve on uniformly refined meshes (h → h/2 → h/4) and see
//! how the governing quantities move.
//!
//! For each quantity q₀ (the model as drawn), q₁, q₂ the observed order is
//! p = log₂((q₁ − q₀)/(q₂ − q₁)) and the Richardson extrapolation q∞ = q₂ + (q₂ − q₁)/(2ᵖ − 1);
//! the estimated discretization error of the model as drawn is |q₀ − q∞| / |q∞|. That holds only
//! in the asymptotic range, so the result says when the sequence is not monotone (oscillating),
//! when it is not converging at all (a singularity: point load, re-entrant corner — peak
//! stresses there grow without bound under refinement), and when the order is implausible.
//! With a single refinement (large models) the order is assumed, p = 1, which over- rather than
//! under-states the error of quantities that converge faster.
//!
//! Governing quantities: the largest translation of any node; the largest principal bending
//! moment and the largest surface von Mises stress of the shells, at element centres (DKT, MITC4,
//! MITC9) or, for curved shells and solid-shells, whose centre values are mid-surface only, at
//! their integration points from the through-thickness pairs; the resultant
//! reaction of each group of connected supported nodes (a line support's nodal reactions depend
//! on the mesh, their sum does not); the largest moment anywhere along any frame member (its
//! exact diagram, so a member split by the refinement reads the same).

use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};

use super::refine::{check_refinable, refine_uniform, GeometryMode};
use super::samples::Family;
use super::{estimate_3d, DEFAULT_THRESHOLD};
use crate::types::*;

fn default_levels() -> usize { 2 }
fn default_max_dofs() -> usize { 250_000 }
fn default_threshold() -> f64 { DEFAULT_THRESHOLD }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvergenceOptions {
    /// Refinement levels beyond the model as drawn (1 or 2).
    #[serde(default = "default_levels")]
    pub levels: usize,
    #[serde(default)]
    pub geometry: GeometryMode,
    /// Refinements whose model would exceed this many DOFs are not solved.
    #[serde(default = "default_max_dofs")]
    pub max_dofs: usize,
    #[serde(default = "default_threshold")]
    pub threshold: f64,
}

impl Default for ConvergenceOptions {
    fn default() -> Self {
        ConvergenceOptions { levels: 2, geometry: GeometryMode::Smooth, max_dofs: default_max_dofs(), threshold: DEFAULT_THRESHOLD }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshLevel {
    pub nodes: usize,
    pub shell_elements: usize,
    /// Recovery-based relative energy-norm error estimate on this mesh.
    pub energy_estimate: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuantityConvergence {
    /// `maxDisplacement`, `maxMoment`, `maxStress`, `reaction`, `maxFrameMoment`.
    pub quantity: String,
    /// For `reaction`: the smallest node id of the support group.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_id: Option<usize>,
    /// One value per mesh, coarsest (the model as drawn) first.
    pub values: Vec<f64>,
    /// The largest change between consecutive meshes, relative to the finest value.
    pub relative_change: f64,
    pub observed_order: Option<f64>,
    pub extrapolated: Option<f64>,
    /// Estimated relative discretization error of the model as drawn, |q₀ − q∞| / |q∞|.
    pub estimated_error: Option<f64>,
    /// `converging`, `converged`, `assumedOrder`, `irregularOrder`, `oscillating`,
    /// `notConverging`, `incomplete` (missing on a refined mesh), `zero`.
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvergenceStudy {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub structured_diagnostics: Vec<StructuredDiagnostic>,
    /// Always false: an estimate, not a bound.
    pub certified: bool,
    pub geometry: GeometryMode,
    pub levels: Vec<MeshLevel>,
    pub quantities: Vec<QuantityConvergence>,
    /// Largest estimated error (or relative change, where no extrapolation exists) over the
    /// governing quantities. With any inconclusive quantity the study is flagged regardless.
    pub max_estimated_error: Option<f64>,
    pub threshold: f64,
    pub exceeds_threshold: bool,
    /// `springsNotDistributed`, `inclinedSupportsDropped`, `supportsInferred`,
    /// `singleRefinement`, `dofLimit`, `centroidStresses`.
    pub caveats: Vec<String>,
    /// Supports the finest solved mesh has at nodes the model as drawn does not: refinement
    /// supports new nodes on exterior edges between supported nodes (`supportsInferred`).
    pub supports_inferred: usize,
}

/// Governing quantities of one solution, keyed for matching across meshes (`original_max_node`:
/// the largest node id of the model as drawn; reaction groups are named by their smallest one).
pub fn governing(input: &SolverInput3D, r: &AnalysisResults3D, original_max_node: usize) -> BTreeMap<(String, usize), f64> {
    let mut q = BTreeMap::new();
    let umax = r.displacements.iter().map(|d| (d.ux * d.ux + d.uy * d.uy + d.uz * d.uz).sqrt()).fold(0.0, f64::max);
    q.insert(("maxDisplacement".to_string(), 0), umax);

    let thick_q: HashMap<usize, f64> = input.quads.values().map(|e| (e.id, e.thickness))
        .chain(input.quad9s.values().map(|e| (e.id, e.thickness)))
        .collect();
    let thick_p: HashMap<usize, f64> = input.plates.values().map(|e| (e.id, e.thickness)).collect();
    let (mut mmax, mut smax) = (0.0_f64, 0.0_f64);
    let mut visit_t = |s: [f64; 3], m: [f64; 3], t: f64| {
        let pm = 0.5 * (m[0] + m[1]);
        let rm = (0.25 * (m[0] - m[1]).powi(2) + m[2] * m[2]).sqrt();
        mmax = mmax.max(pm.abs() + rm);
        let k = if t > 0.0 { 6.0 / (t * t) } else { 0.0 };
        for sign in [-1.0, 1.0] {
            let (a, b, c) = (s[0] + sign * k * m[0], s[1] + sign * k * m[1], s[2] + sign * k * m[2]);
            smax = smax.max((a * a - a * b + b * b + 3.0 * c * c).max(0.0).sqrt());
        }
    };
    for p in &r.plate_stresses {
        visit_t([p.sigma_xx, p.sigma_yy, p.tau_xy], [p.mx, p.my, p.mxy], thick_p.get(&p.element_id).copied().unwrap_or(0.0));
    }
    // MITC4 and MITC9 report membrane stress and moments at their centres. Curved shells and
    // solid-shells report only the mid-surface stress there (moments zero), so theirs are taken
    // from the through-thickness integration-point pairs below instead.
    let centred: std::collections::HashSet<usize> = input.quads.values().map(|e| e.id)
        .chain(input.quad9s.values().map(|e| e.id)).collect();
    for p in &r.quad_stresses {
        if centred.contains(&p.element_id) {
            visit_t([p.sigma_xx, p.sigma_yy, p.tau_xy], [p.mx, p.my, p.mxy], thick_q.get(&p.element_id).copied().unwrap_or(0.0));
        }
    }
    if !(input.curved_shells.is_empty() && input.solid_shells.is_empty()) {
        if let Ok(elems) = super::samples::sample_elements(input, r) {
            for e in elems.iter().filter(|e| matches!(e.family, Family::CurvedShell | Family::SolidShell)) {
                for lo in e.samples.iter().filter(|s| s.zeta < 0.0) {
                    let Some(hi) = e.samples.iter().find(|s| s.zeta > 0.0 && s.xi == lo.xi && s.eta == lo.eta) else { continue };
                    // σ(ζ) linear through the thickness: σ = σm − 6Mζ/t², sampled at ζ = ±g; the
                    // two points are g·t apart along the normal.
                    let g = hi.zeta;
                    let t = super::samples::norm3(&super::samples::sub(&hi.pos, &lo.pos)) / g;
                    let hi_l = super::samples::to_local(&lo.frame, &super::samples::to_global(&hi.frame, &hi.sigma));
                    let mut m = [0.0; 3];
                    let mut sm = [0.0; 3];
                    for k in 0..3 {
                        sm[k] = 0.5 * (lo.sigma[k] + hi_l[k]);
                        m[k] = (lo.sigma[k] - hi_l[k]) * t * t / (12.0 * g);
                    }
                    visit_t(sm, m, t);
                }
            }
        }
    }
    // Every shell family carries bending, so both are governing whenever shells exist: zero on a
    // coarse mesh is a value (a one-element plate whose load goes straight into its supports),
    // and dropping it would drop the quantity from the whole study.
    if shell_count(input) > 0 {
        q.insert(("maxMoment".to_string(), 0), mmax);
        q.insert(("maxStress".to_string(), 0), smax);
    }

    // Reaction groups: supported nodes connected by element edges.
    let supported: std::collections::HashSet<usize> = input.supports.values().map(|s| s.node_id).collect();
    let mut parent: HashMap<usize, usize> = supported.iter().map(|&n| (n, n)).collect();
    fn find(p: &mut HashMap<usize, usize>, x: usize) -> usize {
        let mut r = x;
        while p[&r] != r { r = p[&r]; }
        let mut c = x;
        while p[&c] != r { let n = p[&c]; p.insert(c, r); c = n; }
        r
    }
    let mut link = |a: usize, b: usize, p: &mut HashMap<usize, usize>| {
        if p.contains_key(&a) && p.contains_key(&b) {
            let (ra, rb) = (find(p, a), find(p, b));
            if ra != rb { p.insert(ra.max(rb), ra.min(rb)); }
        }
    };
    let ring = |nodes: &[usize], p: &mut HashMap<usize, usize>, link: &mut dyn FnMut(usize, usize, &mut HashMap<usize, usize>)| {
        for i in 0..nodes.len() { link(nodes[i], nodes[(i + 1) % nodes.len()], p); }
    };
    for e in input.plates.values() { ring(&e.nodes, &mut parent, &mut link); }
    for e in input.quads.values() { ring(&e.nodes, &mut parent, &mut link); }
    for e in input.curved_shells.values() { ring(&e.nodes, &mut parent, &mut link); }
    for e in input.quad9s.values() {
        let n = e.nodes;
        ring(&[n[0], n[4], n[1], n[5], n[2], n[6], n[3], n[7]], &mut parent, &mut link);
    }
    for e in input.solid_shells.values() {
        let n = e.nodes;
        ring(&n[..4], &mut parent, &mut link);
        ring(&n[4..], &mut parent, &mut link);
        for k in 0..4 { link(n[k], n[k + 4], &mut parent); }
    }
    for e in input.elements.values() { link(e.node_i, e.node_j, &mut parent); }
    let mut groups: HashMap<usize, ([f64; 3], usize)> = HashMap::new();
    for rx in &r.reactions {
        if !parent.contains_key(&rx.node_id) { continue; }
        let root = find(&mut parent, rx.node_id);
        let g = groups.entry(root).or_insert(([0.0; 3], usize::MAX));
        g.0[0] += rx.fx;
        g.0[1] += rx.fy;
        g.0[2] += rx.fz;
        if rx.node_id <= original_max_node { g.1 = g.1.min(rx.node_id); }
    }
    for (_, (f, key)) in groups {
        if key != usize::MAX {
            *q.entry(("reaction".to_string(), key)).or_insert(0.0) += (f[0] * f[0] + f[1] * f[1] + f[2] * f[2]).sqrt();
        }
    }

    if !r.element_forces.is_empty() {
        let fm = r.element_forces.iter()
            .map(member_moment_max)
            .fold(0.0_f64, f64::max);
        q.insert(("maxFrameMoment".to_string(), 0), fm);
    }
    q
}

/// The largest |My| or |Mz| anywhere along a member, from its exact diagram
/// (`diagrams_3d::evaluate_diagram_3d_at`), not only at its ends: a member split by refinement
/// has its old interior as new ends, and comparing end values across meshes would report a
/// change where the beam is exact. The diagram is a polynomial between load breakpoints (point
/// loads, ends of partial loads); on each piece the maximum is bracketed on 33 samples and
/// refined by golden-section search, so the same member gives the same maximum to ~1e-12
/// whatever it is split into.
pub fn member_moment_max(ef: &ElementForces3D) -> f64 {
    use crate::postprocess::diagrams_3d::evaluate_diagram_3d_at;
    let l = ef.length;
    if !(l > 0.0) {
        return [ef.my_start, ef.my_end, ef.mz_start, ef.mz_end].iter().fold(0.0_f64, |a, v| a.max(v.abs()));
    }
    let mut best = 0.0_f64;
    for (kind, dls, pls) in [("momentY", &ef.distributed_loads_z, &ef.point_loads_z), ("momentZ", &ef.distributed_loads_y, &ef.point_loads_y)] {
        let mut breaks = vec![0.0, 1.0];
        breaks.extend(pls.iter().map(|p| p.a / l));
        for d in dls.iter() {
            breaks.push(d.a / l);
            breaks.push(d.b / l);
        }
        breaks.retain(|t| (0.0..=1.0).contains(t));
        breaks.sort_by(f64::total_cmp);
        breaks.dedup_by(|a, b| (*a - *b).abs() < 1e-12);
        let f = |t: f64| evaluate_diagram_3d_at(ef, kind, t).abs();
        for w in breaks.windows(2) {
            let (lo, hi) = (w[0], w[1]);
            if hi - lo < 1e-12 { continue; }
            // Just inside each end, so a point-load jump is taken on the side of this piece.
            let (lo_i, hi_i) = (lo + 1e-12, hi - 1e-12);
            let n = 32;
            let ts: Vec<f64> = (0..=n).map(|k| lo_i + (hi_i - lo_i) * k as f64 / n as f64).collect();
            let (k, _) = ts.iter().map(|&t| f(t)).enumerate().fold((0, f64::MIN), |a, (i, v)| if v > a.1 { (i, v) } else { a });
            best = best.max(f(ts[k]));
            let (mut a, mut b) = (ts[k.saturating_sub(1)], ts[(k + 1).min(n)]);
            let g = 0.5 * (5f64.sqrt() - 1.0);
            for _ in 0..80 {
                let (c, d) = (b - g * (b - a), a + g * (b - a));
                if f(c) > f(d) { b = d } else { a = c }
            }
            best = best.max(f(0.5 * (a + b)));
        }
    }
    best
}

/// One quantity's convergence record over the meshes (coarsest first).
pub fn quantity_convergence(name: &str, node_id: Option<usize>, values: Vec<f64>) -> QuantityConvergence {
    let (p, ext, mut err, status) = richardson(&values);
    // Every refinement step counts, relative to the finest value: [1, 1.01, 0.5] moved 50 % in
    // its last step, whatever its first did.
    let finest = values.last().map_or(0.0, |v| v.abs());
    let relative_change = values.windows(2).map(|w| (w[1] - w[0]).abs()).fold(0.0, f64::max) / finest.max(1e-300);
    // An implausible order makes the extrapolation unreliable: never smaller than the changes seen.
    if status == "irregularOrder" {
        err = err.map(|e| e.max(relative_change));
    }
    QuantityConvergence {
        quantity: name.to_string(),
        node_id,
        relative_change,
        values,
        observed_order: p,
        extrapolated: ext,
        estimated_error: err,
        status: status.to_string(),
    }
}

/// Statuses from which no error estimate can be read.
pub fn is_inconclusive(status: &str) -> bool {
    matches!(status, "oscillating" | "notConverging" | "irregularOrder" | "incomplete")
}

/// Richardson analysis of one quantity over the meshes.
pub fn richardson(values: &[f64]) -> (Option<f64>, Option<f64>, Option<f64>, &'static str) {
    let scale = values.iter().fold(0.0_f64, |a, v| a.max(v.abs()));
    if !(scale > 1e-300) {
        return (None, None, None, "zero");
    }
    let rel = |x: f64, y: f64| (x - y).abs() / y.abs().max(1e-300);
    match values {
        [q0, q1] => {
            let p = 1.0;
            let ext = q1 + (q1 - q0) / (2f64.powf(p) - 1.0);
            (None, Some(ext), Some(rel(*q0, ext)), "assumedOrder")
        }
        [q0, q1, q2, ..] => {
            let (d1, d2) = (q1 - q0, q2 - q1);
            // Changes below a millionth of the value are noise, not discretization: a last step
            // that small is converged at the finest mesh, whatever the first did and whichever
            // way it wobbles.
            let tiny = 1e-6 * scale;
            if d2.abs() <= tiny {
                return (None, Some(*q2), Some(rel(*q0, *q2)), "converged");
            }
            if d1 * d2 < 0.0 {
                return (None, None, None, "oscillating");
            }
            if d2.abs() >= d1.abs() {
                return (None, None, None, "notConverging");
            }
            let p = (d1 / d2).log2();
            let ext = q2 + d2 / (2f64.powf(p) - 1.0);
            let status = if (0.5..=6.0).contains(&p) { "converging" } else { "irregularOrder" };
            (Some(p), Some(ext), Some(rel(*q0, ext)), status)
        }
        _ => (None, None, None, "zero"),
    }
}

fn shell_count(i: &SolverInput3D) -> usize {
    i.plates.len() + i.quads.len() + i.quad9s.len() + i.curved_shells.len() + i.solid_shells.len()
}

fn dofs(i: &SolverInput3D) -> usize {
    6 * i.nodes.len()
}

/// Run the convergence study on a 3D linear static model.
pub fn convergence_study_3d(input: &SolverInput3D, opts: &ConvergenceOptions) -> Result<ConvergenceStudy, String> {
    check_refinable(input)?;
    let levels_wanted = opts.levels.clamp(1, 2);
    let original_max_node = input.nodes.values().map(|n| n.id).max().unwrap_or(0);
    let mut caveats: Vec<String> = vec!["centroidStresses".into()];
    let mut models = vec![input.clone()];
    let mut supports_inferred = 0;
    for _ in 0..levels_wanted {
        let refined = refine_uniform(models.last().unwrap(), opts.geometry)?;
        if dofs(&refined.input) > opts.max_dofs {
            caveats.push("dofLimit".into());
            break;
        }
        for c in refined.caveats {
            if !caveats.contains(&c) { caveats.push(c); }
        }
        supports_inferred += refined.supports_inferred;
        models.push(refined.input);
    }
    if models.len() < 2 {
        return Err("tooLarge".into());
    }
    if models.len() == 2 {
        caveats.push("singleRefinement".into());
    }
    let mut structured_diagnostics = Vec::new();
    let mut levels = Vec::new();
    let mut per_level = Vec::new();
    for m in &models {
        let r = crate::solver::linear::solve_3d(m)?;
        crate::known_issues::attach(&mut structured_diagnostics, r.structured_diagnostics.clone());
        let est = crate::known_issues::optional_solve(estimate_3d(m, &r))?.and_then(|e| e.relative_error);
        levels.push(MeshLevel { nodes: m.nodes.len(), shell_elements: shell_count(m), energy_estimate: est });
        per_level.push(governing(m, &r, original_max_node));
    }
    let mut quantities = Vec::new();
    for (k, &v0) in &per_level[0] {
        let values: Vec<f64> = std::iter::once(v0)
            .chain(per_level[1..].iter().map(|g| g.get(k).copied().unwrap_or(f64::NAN)))
            .collect();
        let node = (k.0 == "reaction").then_some(k.1);
        if values.iter().any(|v| !v.is_finite()) {
            // Missing on a refined mesh (a support group that did not carry over): reported as
            // incomplete, never silently dropped.
            let mut q = quantity_convergence(&k.0, node, values.into_iter().filter(|v| v.is_finite()).collect());
            q.status = "incomplete".into();
            q.observed_order = None;
            q.extrapolated = None;
            q.estimated_error = None;
            quantities.push(q);
            continue;
        }
        quantities.push(quantity_convergence(&k.0, node, values));
    }
    let max_estimated_error = quantities.iter()
        .filter(|q| q.status != "zero")
        .map(|q| q.estimated_error.unwrap_or(q.relative_change))
        .fold(None, |a: Option<f64>, v| Some(a.map_or(v, |x| x.max(v))));
    // Inconclusive sequences (not monotone, not converging, implausible order) are flagged
    // whatever their numbers: no error estimate can be read from them.
    let exceeds_threshold = max_estimated_error.is_some_and(|v| v > opts.threshold)
        || quantities.iter().any(|q| is_inconclusive(&q.status));
    Ok(ConvergenceStudy {
        structured_diagnostics,
        certified: false,
        geometry: opts.geometry,
        levels,
        quantities,
        max_estimated_error,
        threshold: opts.threshold,
        exceeds_threshold,
        caveats,
        supports_inferred,
    })
}
