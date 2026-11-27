use crate::types::*;
use super::diagram_extrema::{distributed_actions, sort_cuts, uniform_cuts, Cut};
use super::diagrams::{diagram_critical_cuts_2d, try_evaluate_diagram_cut_2d, sorted_point_loads};
use super::diagrams_3d::{diagram_critical_cuts_3d, try_evaluate_diagram_cut_3d};
use num_rational::BigRational;
use num_traits::{ToPrimitive, Zero};
use serde::{Deserialize, Serialize};
use std::{borrow::Cow, collections::{HashMap, HashSet}, hash::Hash};

// ==================== Input Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombinationFactor {
    pub case_id: usize,
    pub factor: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombinationInput {
    pub factors: Vec<CombinationFactor>,
    pub cases: Vec<CaseEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseEntry {
    pub case_id: usize,
    pub results: AnalysisResults,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombinationInput3D {
    pub factors: Vec<CombinationFactor>,
    pub cases: Vec<CaseEntry3D>,
    #[serde(default)]
    pub plate_thicknesses: Vec<(usize, f64)>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchCombinationInput3D {
    pub combinations: Vec<Vec<CombinationFactor>>,
    pub cases: Vec<CaseEntry3D>,
    #[serde(default)]
    pub plate_thicknesses: Vec<(usize, f64)>,
}

pub fn combine_results_batch_3d(input: &BatchCombinationInput3D) -> Result<Vec<Option<AnalysisResults3D>>, String> {
    let thicknesses = input.plate_thicknesses.iter().copied().collect();
    let mut by_id = std::collections::HashMap::new();
    for case in &input.cases {
        if by_id.insert(case.case_id, &case.results).is_some() {
            return Err(format!("Cannot combine results: duplicate case id {}", case.case_id));
        }
    }
    input.combinations.iter().map(|factors| {
        let mut seen = HashSet::with_capacity(factors.len());
        let cases: Vec<_> = factors.iter().map(|f| f.case_id)
            .filter(|&id| seen.insert(id))
            .filter_map(|id| by_id.get(&id).map(|&result| (id, result)))
            .collect();
        combine_results_3d_refs_with_thickness(factors, &cases, &thicknesses)
    }).collect()
}

/// Plate id → thickness, which a combined plate's face stresses need.
pub type PlateThicknesses = std::collections::HashMap<usize, f64>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseEntry3D {
    pub case_id: usize,
    pub results: AnalysisResults3D,
}

// ==================== Envelope Output Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementEnvelopeDiagram {
    pub element_id: usize,
    pub t_positions: Vec<f64>,
    pub pos_values: Vec<f64>,
    pub neg_values: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvelopeDiagramData {
    pub kind: String,
    pub elements: Vec<ElementEnvelopeDiagram>,
    pub global_max: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FullEnvelope {
    pub moment: EnvelopeDiagramData,
    pub shear: EnvelopeDiagramData,
    pub axial: EnvelopeDiagramData,
    pub max_abs_results: AnalysisResults,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FullEnvelope3D {
    pub moment_y: EnvelopeDiagramData,
    pub moment_z: EnvelopeDiagramData,
    pub shear_y: EnvelopeDiagramData,
    pub shear_z: EnvelopeDiagramData,
    pub axial: EnvelopeDiagramData,
    pub torsion: EnvelopeDiagramData,
    #[serde(rename = "maxAbsResults3D")]
    pub max_abs_results_3d: AnalysisResults3D,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvelopeInput {
    pub results: Vec<AnalysisResults>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvelopeInput3D {
    pub results: Vec<AnalysisResults3D>,
}

const N_POINTS: usize = 21;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EnvelopedFields<'a, D, R, E> {
    displacements: &'a [D],
    reactions: &'a [R],
    element_forces: &'a [E],
}

struct RowLayout<'a, T, Id> {
    rows: &'a [T],
    slots: HashMap<usize, usize>,
    id: Id,
    field: &'static str,
    entity: &'static str,
}

impl<'a, T: Clone, Id: Fn(&T) -> usize> RowLayout<'a, T, Id> {
    fn new(rows: &'a [T], id: Id, field: &'static str, entity: &'static str) -> Result<Self, String> {
        let mut slots = HashMap::with_capacity(rows.len());
        for (slot, row) in rows.iter().enumerate() {
            let key = id(row);
            if slots.insert(key, slot).is_some() {
                return Err(format!("{field} contain duplicate {entity} id {key}"));
            }
        }
        Ok(Self { rows, slots, id, field, entity })
    }

    fn align(&self, rows: &'a [T]) -> Result<Cow<'a, [T]>, String> {
        if self.rows.iter().map(&self.id).eq(rows.iter().map(&self.id)) {
            return Ok(Cow::Borrowed(rows));
        }

        let mut ordered = vec![None; self.rows.len()];
        for row in rows {
            let key = (self.id)(row);
            let Some(&slot) = self.slots.get(&key) else {
                return Err(format!("{} contain unexpected {} id {key}", self.field, self.entity));
            };
            if ordered[slot].replace(row).is_some() {
                return Err(format!("{} contain duplicate {} id {key}", self.field, self.entity));
            }
        }
        if let Some(slot) = ordered.iter().position(Option::is_none) {
            let key = (self.id)(&self.rows[slot]);
            return Err(format!("{} are missing {} id {key}", self.field, self.entity));
        }
        Ok(Cow::Owned(ordered.into_iter().flatten().cloned().collect()))
    }
}

struct AlignedResultFields<'a, D: Clone, R: Clone, E: Clone> {
    displacements: Cow<'a, [D]>,
    reactions: Cow<'a, [R]>,
    element_forces: Cow<'a, [E]>,
}

fn align_result_fields<'a, D: Clone, R: Clone, E: Clone>(
    operation: &str,
    label: &str,
    mut cases: impl Iterator<Item = (usize, EnvelopedFields<'a, D, R, E>)>,
    displacement_id: impl Fn(&D) -> usize,
    reaction_id: impl Fn(&R) -> usize,
    element_id: impl Fn(&E) -> usize,
) -> Result<Vec<AlignedResultFields<'a, D, R, E>>, String> {
    let Some((first_id, first)) = cases.next() else { return Ok(Vec::new()) };
    let err = |id, reason| format!("{operation}: {label} {id} {reason}");
    let displacements = RowLayout::new(first.displacements, displacement_id, "displacements", "node")
        .map_err(|reason| err(first_id, reason))?;
    let reactions = RowLayout::new(first.reactions, reaction_id, "reactions", "node")
        .map_err(|reason| err(first_id, reason))?;
    let element_forces = RowLayout::new(first.element_forces, element_id, "element forces", "element")
        .map_err(|reason| err(first_id, reason))?;

    let mut aligned = Vec::with_capacity(1 + cases.size_hint().0);
    aligned.push(AlignedResultFields {
        displacements: Cow::Borrowed(first.displacements),
        reactions: Cow::Borrowed(first.reactions),
        element_forces: Cow::Borrowed(first.element_forces),
    });
    for (id, fields) in cases {
        aligned.push(AlignedResultFields {
            displacements: displacements.align(fields.displacements).map_err(|reason| err(id, reason))?,
            reactions: reactions.align(fields.reactions).map_err(|reason| err(id, reason))?,
            element_forces: element_forces.align(fields.element_forces).map_err(|reason| err(id, reason))?,
        });
    }
    Ok(aligned)
}

impl<'a, D, R, E> From<&'a AnalysisResults<D, R, E>> for EnvelopedFields<'a, D, R, E> {
    fn from(result: &'a AnalysisResults<D, R, E>) -> Self {
        Self {
            displacements: &result.displacements,
            reactions: &result.reactions,
            element_forces: &result.element_forces,
        }
    }
}

impl<'a, D, R, E> From<&'a AnalysisResults3D<D, R, E>> for EnvelopedFields<'a, D, R, E> {
    fn from(result: &'a AnalysisResults3D<D, R, E>) -> Self {
        Self {
            displacements: &result.displacements,
            reactions: &result.reactions,
            element_forces: &result.element_forces,
        }
    }
}

fn check_result_fields<'a, D: Serialize + 'a, R: Serialize + 'a, E: Serialize + 'a>(
    operation: &str,
    cases: impl Iterator<Item = (usize, EnvelopedFields<'a, D, R, E>)>,
) -> Result<(), String> {
    for (i, fields) in cases {
        let bad = crate::certify::finite::non_finite_paths(&fields);
        if let Some(first) = bad.first() {
            return Err(format!(
                "{operation}: result {i} has a non-finite number at {}",
                first.strip_prefix("$.").unwrap_or(first)
            ));
        }
    }
    Ok(())
}

fn member_envelope<C>(
    kind: &str,
    element_id: usize,
    cases: &[C],
    critical_cuts: impl Fn(&C) -> Result<Vec<Cut>, String>,
    evaluate: impl Fn(&C, Cut) -> Result<f64, String>,
) -> Result<(ElementEnvelopeDiagram, f64), String> {
    let context = || format!("Cannot compute the envelope: {kind} of element {element_id}");
    let mut stations: Vec<_> = uniform_cuts(N_POINTS).collect();
    for (result, case) in cases.iter().enumerate() {
        stations.extend(critical_cuts(case).map_err(|error| format!("{} in result {result}: {error}", context()))?);
    }
    sort_cuts(&mut stations).map_err(|error| format!("{}: {error}", context()))?;

    let mut t_positions = Vec::with_capacity(stations.len());
    let mut pos_values = Vec::with_capacity(stations.len());
    let mut neg_values = Vec::with_capacity(stations.len());
    let mut global_max = 0.0_f64;
    for cuts in stations.chunk_by(|a, b| a.t == b.t && a.right == b.right) {
        let t = cuts[0].t;
        let mut max_pos = 0.0_f64;
        let mut max_neg = 0.0_f64;
        for &cut in cuts {
            for (result, case) in cases.iter().enumerate() {
                let location = || format!("{} at t = {t} in result {result}", context());
                let val = evaluate(case, cut).map_err(|error| format!("{}: {error}", location()))?;
                if !val.is_finite() {
                    return Err(format!("{} evaluates to {val}, beyond the range of f64", location()));
                }
                if val > max_pos {
                    max_pos = val;
                }
                if val < max_neg {
                    max_neg = val;
                }
            }
        }
        t_positions.push(t);
        pos_values.push(max_pos);
        neg_values.push(max_neg);
        global_max = global_max.max(max_pos).max(-max_neg);
    }
    Ok((ElementEnvelopeDiagram { element_id, t_positions, pos_values, neg_values }, global_max))
}

/// Map each id to its slot index. Later duplicates keep the first slot, which
/// matches the previous positional behavior for well-formed inputs.
fn index_by_id(ids: impl Iterator<Item = usize>) -> std::collections::HashMap<usize, usize> {
    let mut map = std::collections::HashMap::new();
    for (i, id) in ids.enumerate() {
        map.entry(id).or_insert(i);
    }
    map
}

// ==================== 2D Combination ====================

enum FactorSum {
    Single(f64),
    Exact(BigRational),
    NonFinite,
}

impl FactorSum {
    fn add(&mut self, factor: f64) {
        match self {
            Self::Single(first) => {
                *self = BigRational::from_float(*first)
                    .zip(BigRational::from_float(factor))
                    .map_or(Self::NonFinite, |(a, b)| Self::Exact(a + b));
            }
            Self::Exact(sum) => match BigRational::from_float(factor) {
                Some(factor) => *sum += factor,
                None => *self = Self::NonFinite,
            },
            Self::NonFinite => {}
        }
    }
}

pub(crate) struct CaseFactorSums<Id>(Vec<(Id, f64)>);

impl<Id> CaseFactorSums<Id> {
    pub(crate) fn iter(&self) -> impl Iterator<Item = &(Id, f64)> {
        self.0.iter()
    }
}

impl<Id: Copy + Eq + Hash> CaseFactorSums<Id> {
    pub(crate) fn new(factors: &[(Id, f64)]) -> Self {
        let mut slots = HashMap::new();
        let mut totals: Vec<(Id, FactorSum)> = Vec::new();
        for &(id, factor) in factors {
            if factor == 0.0 {
                continue;
            }
            let slot = *slots.entry(id).or_insert(totals.len());
            if slot == totals.len() {
                totals.push((id, FactorSum::Single(factor)));
            } else {
                totals[slot].1.add(factor);
            }
        }
        let nonzero = totals
            .into_iter()
            .filter_map(|(id, total)| {
                let factor = match total {
                    FactorSum::Single(factor) => factor,
                    FactorSum::Exact(sum) if sum.is_zero() => return None,
                    FactorSum::Exact(sum) => sum.to_f64().unwrap_or(f64::NAN),
                    FactorSum::NonFinite => factors
                        .iter()
                        .filter(|(other, _)| *other == id)
                        .map(|(_, factor)| factor)
                        .sum(),
                };
                Some((id, factor))
            })
            .collect();
        Self(nonzero)
    }
}

struct ResolvedFactors {
    terms: Vec<(f64, usize)>,
}

impl ResolvedFactors {
    fn new<T>(factors: &[CombinationFactor], cases: &[(usize, &T)]) -> Result<Self, String> {
        Self::resolve(factors, cases, false)
    }

    fn resolve<T>(factors: &[CombinationFactor], cases: &[(usize, &T)], allow_cancellation: bool) -> Result<Self, String> {
        let mut slots = HashMap::with_capacity(cases.len());
        for (slot, &(id, _)) in cases.iter().enumerate() {
            if slots.insert(id, slot).is_some() {
                return Err(format!("Cannot combine results: duplicate case id {id}"));
            }
        }

        let mut weighted_slots = Vec::new();
        for &CombinationFactor { case_id, factor } in factors {
            if factor == 0.0 {
                continue;
            }
            let Some(&slot) = slots.get(&case_id) else {
                return Err(format!("Cannot combine results: missing result for load case {case_id}"));
            };
            weighted_slots.push((slot, factor));
        }
        let terms: Vec<_> = CaseFactorSums::new(&weighted_slots).0.into_iter()
            .map(|(slot, factor)| (factor, slot))
            .collect();
        if !allow_cancellation && terms.is_empty() && !weighted_slots.is_empty() {
            return Err("Repeated load case factors cancel to zero in this combination.".into());
        }
        Ok(Self { terms })
    }

    fn second_order_screen(&self, carried: &[StructuredDiagnostic], ratio: Option<f64>) -> Vec<StructuredDiagnostic> {
        let reversed = self.terms.iter().any(|&(factor, _)| factor < 0.0);
        let mut findings = crate::known_issues::combined_second_order(carried.iter(), reversed, ratio);
        if matches!(&self.terms[..], [(factor, _)] if *factor == 1.0) {
            crate::known_issues::attach(&mut findings, carried.iter().filter(|d| d.phase.as_deref() == Some("LIN-SECOND-ORDER-NEAR")).cloned().collect());
        }
        findings
    }

    fn contributions<'a, T>(&'a self, cases: &'a [(usize, &'a T)]) -> impl Iterator<Item = (f64, usize, &'a T)> + 'a {
        self.terms.iter().map(|&(factor, slot)| {
            let (id, result) = cases[slot];
            (factor, id, result)
        })
    }

    fn case_factors<T>(&self, cases: &[(usize, &T)]) -> Vec<CombinationFactor> {
        self.contributions(cases).map(|(factor, case_id, _)| CombinationFactor { case_id, factor }).collect()
    }

    fn require_finite<T>(&self, cases: &[(usize, &T)]) -> Result<(), String> {
        if let Some(&(factor, slot)) = self.terms.iter().find(|(factor, _)| !factor.is_finite()) {
            let case_id = cases[slot].0;
            return Err(format!(
                "Cannot combine results: load case {case_id} has a non-finite number at net factor={factor}"
            ));
        }
        Ok(())
    }
}

pub(crate) fn net_combination_factors(factors: &[CombinationFactor], allow_cancellation: bool) -> Result<Vec<CombinationFactor>, String> {
    let mut seen = HashSet::with_capacity(factors.len());
    let cases: Vec<_> = factors.iter().map(|f| f.case_id).filter(|&id| seen.insert(id)).map(|id| (id, &())).collect();
    let resolved = ResolvedFactors::resolve(factors, &cases, allow_cancellation)?;
    resolved.require_finite(&cases)?;

    seen.clear();
    let mut net = resolved.case_factors(&cases);
    seen.extend(net.iter().map(|f| f.case_id));
    net.extend(cases.iter().filter(|(id, _)| !seen.contains(id)).map(|&(case_id, _)| CombinationFactor { case_id, factor: 0.0 }));
    Ok(net)
}

/// Whether a case may compress a member, for a case without a screened ratio: compression from an
/// axial span load can leave both end forces at zero or in tension.
fn axial_2d(f: &ElementForces) -> bool {
    f.n_start != 0.0 || f.n_end != 0.0 || f.distributed_loads_x.iter().any(|q| q.q_i != 0.0 || q.q_j != 0.0) || f.point_loads.iter().any(|p| p.px.is_some_and(|px| px != 0.0))
}

fn axial_3d(f: &ElementForces3D) -> bool {
    f.n_start != 0.0 || f.n_end != 0.0 || f.distributed_loads_x.iter().any(|q| q.q_i != 0.0 || q.q_j != 0.0)
}

/// Linearly combine AnalysisResults from multiple load cases.
pub fn combine_results(input: &CombinationInput) -> Option<AnalysisResults> {
    let cases: Vec<(usize, &AnalysisResults)> =
        input.cases.iter().map(|c| (c.case_id, &c.results)).collect();
    combine_results_refs(&input.factors, &cases)
}

/// `combine_results` over borrowed case results: `(case_id, &results)` pairs,
/// avoiding per-combination clones of every case.
/// `None` when a contributing case carries a refusal; `combine_results_checked` says which.
pub fn combine_results_refs(factors: &[CombinationFactor], cases: &[(usize, &AnalysisResults)]) -> Option<AnalysisResults> {
    match combine_results_refs_checked(factors, cases) {
        Ok(result) => result,
        Err(_) => {
            let resolved = ResolvedFactors::new(factors, cases).ok()?;
            for (_, result) in cases {
                for ef in &result.element_forces {
                    super::diagrams::validate_diagram_loads_2d(ef).ok()?;
                }
            }
            let non_finite = cases.iter()
                .filter(|(id, _)| factors.iter().any(|f| f.case_id == *id && f.factor != 0.0))
                .find_map(|(_, r)| crate::boundary::find_non_finite(*r).ok().flatten())?;
            let mut structured_diagnostics = vec![non_finite.diagnostic()];
            let (_, _, screen) = combined_screen_2d(&resolved, cases, &[]);
            crate::known_issues::attach(&mut structured_diagnostics, screen);
            Some(AnalysisResults {
                displacements: vec![], reactions: vec![], element_forces: vec![], constraint_forces: vec![],
                diagnostics: vec![], solver_diagnostics: vec![], structured_diagnostics, equilibrium: None,
                result_summary: None, solver_run_meta: None,
            })
        }
    }
}

fn combined_screen_2d(resolved: &ResolvedFactors, cases: &[(usize, &AnalysisResults)], carried: &[StructuredDiagnostic]) -> (Option<f64>, Option<f64>, Vec<StructuredDiagnostic>) {
    let ratio = crate::known_issues::combined_ratio(cases.iter().enumerate().map(|(slot, (_, r))| {
        let factor = resolved.terms.iter().find(|&&(_, s)| s == slot).map_or(0.0, |&(factor, _)| factor);
        (factor.abs(), r.result_summary.as_ref(), r.element_forces.iter().any(axial_2d))
    }));
    let physical = resolved.contributions(cases).try_fold(0.0, |total, (factor, _, r)| {
        if factor < 0.0 { return None; }
        let summary = r.result_summary.as_ref()?;
        let upper = crate::known_issues::physical_screen_bound(&r.structured_diagnostics, summary.second_order_physical_bound, summary.second_order_ratio)?;
        Some(total + factor * upper)
    });
    let extra_bound = physical.filter(|&upper| ratio.is_some_and(|reported| upper > reported));
    let mut diagnostics = resolved.second_order_screen(carried, ratio);
    if extra_bound.is_some() { crate::known_issues::check_physical_band(&mut diagnostics, extra_bound); }
    (ratio, extra_bound, diagnostics)
}

pub(crate) fn combine_results_refs_checked(factors: &[CombinationFactor], cases: &[(usize, &AnalysisResults)]) -> Result<Option<AnalysisResults>, String> {
    let resolved = ResolvedFactors::new(factors, cases)?;
    if cases.iter().any(|(id, r)| factors.iter().any(|f| f.case_id == *id && f.factor != 0.0) && crate::known_issues::refuse_contained(&r.structured_diagnostics, *r).is_err()) {
        return Ok(None);
    }
    resolved.require_finite(cases)?;
    for (_, result) in cases {
        crate::boundary::require_finite(*result)?;
        for ef in &result.element_forces {
            super::diagrams::validate_diagram_input_2d(ef)?;
        }
    }
    let Some(template) = cases.first() else { return Ok(None) };
    let tr = template.1;

    let mut displacements: Vec<Displacement> = tr.displacements.iter()
        .map(|d| Displacement { node_id: d.node_id, ux: 0.0, uz: 0.0, ry: 0.0 })
        .collect();
    let mut reactions: Vec<Reaction> = tr.reactions.iter()
        .map(|r| Reaction { node_id: r.node_id, rx: 0.0, rz: 0.0, my: 0.0 })
        .collect();
    let mut element_forces: Vec<ElementForces> = tr.element_forces.iter()
        .map(|f| ElementForces {
            element_id: f.element_id,
            n_start: 0.0, n_end: 0.0, v_start: 0.0, v_end: 0.0, m_start: 0.0, m_end: 0.0,
            length: f.length, q_i: 0.0, q_j: 0.0,
            point_loads: Vec::new(),
            distributed_loads: Vec::new(), distributed_loads_x: Vec::new(),
            hinge_start: f.hinge_start, hinge_end: f.hinge_end,
        })
        .collect();

    // Slots are addressed by id, never by position: cases are free to list
    // their nodes/elements in any order, and a case missing an entry simply
    // contributes nothing to that slot instead of shifting every later one.
    let disp_slot = index_by_id(displacements.iter().map(|d| d.node_id));
    let reaction_slot = index_by_id(reactions.iter().map(|r| r.node_id));
    let element_slot = index_by_id(element_forces.iter().map(|e| e.element_id));
    for &(f, slot) in &resolved.terms {
        let r = cases[slot].1;

        for d in &r.displacements {
            let Some(&i) = disp_slot.get(&d.node_id) else { continue };
            displacements[i].ux += f * d.ux;
            displacements[i].uz += f * d.uz;
            displacements[i].ry += f * d.ry;
        }
        for rx in &r.reactions {
            let Some(&i) = reaction_slot.get(&rx.node_id) else { continue };
            reactions[i].rx += f * rx.rx;
            reactions[i].rz += f * rx.rz;
            reactions[i].my += f * rx.my;
        }
        for ef in &r.element_forces {
            let Some(&i) = element_slot.get(&ef.element_id) else { continue };
            let out = &mut element_forces[i];
            out.n_start += f * ef.n_start;
            out.n_end += f * ef.n_end;
            out.v_start += f * ef.v_start;
            out.v_end += f * ef.v_end;
            out.m_start += f * ef.m_start;
            out.m_end += f * ef.m_end;
            out.q_i += f * ef.q_i;
            out.q_j += f * ef.q_j;
            for dl in distributed_actions(ef.length, &ef.distributed_loads, ef.q_i, ef.q_j) {
                out.distributed_loads.push(DistributedLoadInfo {
                    q_i: dl.q_i * f, q_j: dl.q_j * f, a: dl.a, b: dl.b,
                });
            }
            for dl in &ef.distributed_loads_x {
                out.distributed_loads_x.push(DistributedLoadInfo {
                    q_i: dl.q_i * f, q_j: dl.q_j * f, a: dl.a, b: dl.b,
                });
            }
            // The diagram evaluator reconstructs interior values from these;
            // dropping them leaves the end forces right and everything between
            // them wrong.
            for pl in &ef.point_loads {
                out.point_loads.push(PointLoadInfo {
                    a: pl.a,
                    p: pl.p * f,
                    px: pl.px.map(|v| v * f),
                    my: pl.my.map(|v| v * f),
                });
            }
        }
    }

    let mut structured_diagnostics = Vec::new();
    let mut carried = Vec::new();
    let mut second_order = Vec::new();
    for (_, _, result) in resolved.contributions(cases) {
        let (small, others): (Vec<_>, Vec<_>) = crate::result_sites::known_issues(result).into_iter().partition(|d| d.phase.as_deref() == Some("LIN-SMALL-DISPLACEMENT"));
        let (second, others): (Vec<_>, Vec<_>) = others.into_iter().partition(crate::known_issues::is_second_order);
        carried.extend(small);
        second_order.extend(second);
        crate::known_issues::attach(&mut structured_diagnostics, others);
    }
    let (ratio, upper, screen) = combined_screen_2d(&resolved, cases, &second_order);
    crate::known_issues::attach(&mut structured_diagnostics, screen);
    let mut combined = AnalysisResults { displacements, reactions, element_forces, constraint_forces: vec![], diagnostics: vec![], solver_diagnostics: vec![], structured_diagnostics, equilibrium: None, result_summary: Some(ResultSummary { second_order_ratio: ratio, second_order_physical_bound: upper, ..Default::default() }), solver_run_meta: None };
    check_result_fields("Cannot combine results", std::iter::once((0, EnvelopedFields {
        displacements: &combined.displacements, reactions: &combined.reactions, element_forces: &combined.element_forces,
    })))?;
    for ef in &combined.element_forces {
        super::diagrams::validate_diagram_input_2d(ef)?;
    }
    let factored = resolved.contributions(cases).map(|(f, _, case)| (f, case.result_summary.as_ref()));
    let (beyond, chords, spans) = crate::known_issues::combined_small_displacement(crate::known_issues::rotated_nodes_2d(&combined), factored, &carried, |spans| crate::known_issues::span_rotations_2d(spans, &combined));
    crate::known_issues::attach(&mut combined.structured_diagnostics, beyond.into_iter().collect());
    let summary = combined.result_summary.get_or_insert_with(Default::default);
    summary.member_chords = chords;
    summary.member_spans = spans;
    Ok(Some(combined))
}

/// `combine_results` for results received from outside the engine: a contributing case that
/// carries a refusal is refused instead of being combined into usable numbers.
pub fn combine_results_checked(input: &CombinationInput) -> Result<Option<AnalysisResults>, String> {
    for case in input.cases.iter().filter(|c| input.factors.iter().any(|f| f.case_id == c.case_id && f.factor != 0.0)) {
        crate::known_issues::refuse_contained(&case.results.structured_diagnostics, &case.results)?;
    }
    for case in &input.cases {
        crate::boundary::require_finite(&case.results)?;
        for ef in &case.results.element_forces {
            super::diagrams::validate_diagram_input_2d(ef)?;
        }
    }
    let cases: Vec<_> = input.cases.iter().map(|c| (c.case_id, &c.results)).collect();
    combine_results_refs_checked(&input.factors, &cases)
}

// ==================== 2D Envelope ====================

/// Compute pointwise envelope from multiple results. A result that carries a refusal is refused.
pub fn compute_envelope(results: &[AnalysisResults]) -> Result<FullEnvelope, String> {
    for result in results {
        crate::known_issues::refuse_contained(&result.structured_diagnostics, result)?;
    }
    let first = results.first().ok_or_else(|| "Cannot compute the envelope of no results".to_string())?;
    check_result_fields("Cannot compute the envelope", results.iter().enumerate().map(|(i, r)| {
        (i, EnvelopedFields::from(r))
    }))?;
    for result in results {
        for ef in &result.element_forces {
            super::diagrams::validate_diagram_input_2d(ef)?;
        }
    }

    let aligned = align_result_fields(
        "Cannot compute the envelope",
        "result",
        results.iter().map(EnvelopedFields::from).enumerate(),
        |row| row.node_id,
        |row| row.node_id,
        |row| row.element_id,
    )?;
    let mut displacements = first.displacements.clone();
    let mut reactions = first.reactions.clone();
    let mut element_forces = first.element_forces.clone();

    for result in &aligned[1..] {
        for (out, d) in displacements.iter_mut().zip(result.displacements.iter()) {
            if d.ux.abs() > out.ux.abs() { out.ux = d.ux; }
            if d.uz.abs() > out.uz.abs() { out.uz = d.uz; }
            if d.ry.abs() > out.ry.abs() { out.ry = d.ry; }
        }
        for (out, rx) in reactions.iter_mut().zip(result.reactions.iter()) {
            if rx.rx.abs() > out.rx.abs() { out.rx = rx.rx; }
            if rx.rz.abs() > out.rz.abs() { out.rz = rx.rz; }
            if rx.my.abs() > out.my.abs() { out.my = rx.my; }
        }
        for (out, ef) in element_forces.iter_mut().zip(result.element_forces.iter()) {
            if ef.n_start.abs() > out.n_start.abs() { out.n_start = ef.n_start; }
            if ef.n_end.abs() > out.n_end.abs() { out.n_end = ef.n_end; }
            if ef.v_start.abs() > out.v_start.abs() { out.v_start = ef.v_start; }
            if ef.v_end.abs() > out.v_end.abs() { out.v_end = ef.v_end; }
            if ef.m_start.abs() > out.m_start.abs() { out.m_start = ef.m_start; }
            if ef.m_end.abs() > out.m_end.abs() { out.m_end = ef.m_end; }
        }
    }

    let mut structured_diagnostics = Vec::new();
    for result in results {
        crate::known_issues::attach(&mut structured_diagnostics, crate::result_sites::known_issues(result));
    }
    let max_abs_results = AnalysisResults { displacements, reactions, element_forces, constraint_forces: vec![], diagnostics: vec![], solver_diagnostics: vec![], structured_diagnostics, equilibrium: None, result_summary: None, solver_run_meta: None };

    fn compute_env_diagram(kind: &str, results: &[AlignedResultFields<'_, Displacement, Reaction, ElementForces>]) -> Result<EnvelopeDiagramData, String> {
        let first = &results[0];
        let mut elements = Vec::new();
        let mut global_max = 0.0f64;

        for (e_idx, ef) in first.element_forces.iter().enumerate() {
            let cases: Vec<_> = results.iter().map(|res| {
                let forces = &res.element_forces[e_idx];
                (forces, sorted_point_loads(forces))
            }).collect();
            let (element, peak) = member_envelope(
                kind, ef.element_id, &cases,
                |(forces, points)| diagram_critical_cuts_2d(forces, kind, points),
                |(forces, points), cut| try_evaluate_diagram_cut_2d(kind, cut, forces, points),
            )?;
            elements.push(element);
            global_max = global_max.max(peak);
        }

        Ok(EnvelopeDiagramData { kind: kind.to_string(), elements, global_max })
    }

    Ok(FullEnvelope {
        moment: compute_env_diagram("moment", &aligned)?,
        shear: compute_env_diagram("shear", &aligned)?,
        axial: compute_env_diagram("axial", &aligned)?,
        max_abs_results,
    })
}

// ==================== 3D Combination ====================

/// Linearly combine 3D results.
pub fn combine_results_3d(input: &CombinationInput3D) -> Result<Option<AnalysisResults3D>, String> {
    let cases: Vec<(usize, &AnalysisResults3D)> =
        input.cases.iter().map(|c| (c.case_id, &c.results)).collect();
    combine_results_3d_refs_with_thickness(&input.factors, &cases, &input.plate_thicknesses.iter().copied().collect())
}

/// `combine_results_3d_refs_with_thickness` without plate thicknesses: refuses plate stresses.
pub fn combine_results_3d_refs(factors: &[CombinationFactor], cases: &[(usize, &AnalysisResults3D)]) -> Result<Option<AnalysisResults3D>, String> {
    combine_results_3d_refs_with_thickness(factors, cases, &PlateThicknesses::new())
}

/// `combine_results_3d` over borrowed case results: `(case_id, &results)` pairs,
/// avoiding per-combination clones of every case. Distorted-shell results combine only when
/// Σ|factor| ≤ 1, which keeps each case's checked membrane-stress variation within its bound.
/// Shell stresses are refused unless every contributing case lists the same shells in the same
/// order, and plate stresses unless `plate_thickness` has each plate.
pub fn combine_results_3d_refs_with_thickness(factors: &[CombinationFactor], cases: &[(usize, &AnalysisResults3D)], plate_thickness: &PlateThicknesses) -> Result<Option<AnalysisResults3D>, String> {
    let resolved = ResolvedFactors::new(factors, cases)?;
    let contributing = cases.iter().filter(|(id, _)| factors.iter().any(|f| f.case_id == *id && f.factor != 0.0));
    let weight: f64 = resolved.terms.iter().map(|(factor, _)| factor.abs()).sum();
    for (_, result) in contributing {
        crate::known_issues::refuse_contained(&result.structured_diagnostics, result)?;
    }
    for (_, _, result) in resolved.contributions(cases) {
        if !(weight <= 1.0) && crate::result_sites::known_issues(result).iter().any(|d| d.phase.as_deref() == Some("SH-MITC4-DISTORTION")) {
            crate::known_issues::refuse(&[crate::known_issues::diagnostic("SH-MITC4-DISTORTION")])?;
        }
    }
    combine_resolved_results_3d(cases, &resolved, plate_thickness)
}

struct CombinedShells {
    plates: Vec<PlateStress>,
    quads: Vec<QuadStress>,
    nodal: Vec<QuadNodalStress>,
}

fn same_sequence<T, K: PartialEq>(case: usize, what: &str, template: (usize, &[T]), other: &[T], key: impl Fn(&T) -> K) -> Result<(), String> {
    if template.1.len() == other.len() && template.1.iter().map(&key).eq(other.iter().map(&key)) {
        return Ok(());
    }
    Err(format!(
        "Cannot combine the shell stresses: case {case} lists its {what} differently from case {}, so they cannot be matched shell by shell",
        template.0
    ))
}

fn membrane_von_mises(sxx: f64, syy: f64, txy: f64) -> f64 {
    let (down, up) = crate::element::plate::power_of_two_scale([sxx, syy, txy]);
    let (sxx, syy, txy) = (sxx * down, syy * down, txy * down);
    (sxx * sxx - sxx * syy + syy * syy + 3.0 * txy * txy).sqrt() * up
}

/// Σ f·b for finite terms whose plain sum overflowed partway. Products are summed with compensation, scaled
/// down by 2^shift, and those too small to survive that scaling apart and unscaled, so a residual left by
/// cancelling large terms is kept wherever it sits and only a total beyond f64 stays non-finite.
fn rescaled_sum(terms: impl Iterator<Item = (f64, f64)> + Clone) -> f64 {
    use crate::element::plate::{binary_exponent, ldexp};
    if terms.clone().any(|(f, b)| !f.is_finite() || !b.is_finite()) {
        return terms.fold(0.0, |a, (f, b)| a + f * b);
    }
    let products = terms.filter(|&(f, b)| f != 0.0 && b != 0.0).map(|(f, b)| (binary_exponent(f) + binary_exponent(b), ldexp(f, -binary_exponent(f)) * ldexp(b, -binary_exponent(b))));
    let Some(top) = products.clone().map(|(e, _)| e).max() else { return 0.0 };
    let shift = (top - 1000).max(0);
    let (mut large, mut small) = ([0.0, 0.0], [0.0, 0.0]);
    for (e, p) in products {
        if e - shift >= -1000 {
            compensated_add(&mut large, ldexp(p, e - shift));
        } else {
            compensated_add(&mut small, ldexp(p, e));
        }
    }
    ldexp(large[0] + large[1], shift) + (small[0] + small[1])
}

fn compensated_add(acc: &mut [f64; 2], x: f64) {
    let t = acc[0] + x;
    acc[1] += if acc[0].abs() >= x.abs() { (acc[0] - t) + x } else { (x - t) + acc[0] };
    acc[0] = t;
}

fn combine_shells(terms: &[(f64, usize, &AnalysisResults3D)], template: (usize, &AnalysisResults3D), plate_thickness: &PlateThicknesses) -> Result<CombinedShells, String> {
    let (tid, tr) = template;
    crate::shell_combination_kernel::unique_ids(tr.plate_stresses.iter().map(|p| p.element_id))?;
    crate::shell_combination_kernel::unique_ids(tr.quad_stresses.iter().map(|q| q.element_id))?;
    for &(_, id, r) in terms {
        same_sequence(id, "plates", (tid, &tr.plate_stresses), &r.plate_stresses, |p| p.element_id)?;
        same_sequence(id, "quads", (tid, &tr.quad_stresses), &r.quad_stresses, |q| q.element_id)?;
        same_sequence(id, "nodal shell stresses", (tid, &tr.quad_nodal_stresses), &r.quad_nodal_stresses, |n| n.node_index)?;
    }
    let sum = |at: &dyn Fn(&AnalysisResults3D) -> [f64; 6]| -> [f64; 6] {
        let mut v = [0.0; 6];
        for &(f, _, r) in terms {
            for (a, b) in v.iter_mut().zip(at(r)) {
                *a += f * b;
            }
        }
        for (i, a) in v.iter_mut().enumerate() {
            if !a.is_finite() {
                *a = rescaled_sum(terms.iter().map(|&(f, _, r)| (f, at(r)[i])));
            }
        }
        v
    };
    let shear = |init: [Option<f64>; 2], at: &dyn Fn(&AnalysisResults3D) -> [Option<f64>; 2]| -> [Option<f64>; 2] {
        let mut q = init.map(|x| x.map(|_| 0.0));
        for &(f, _, r) in terms {
            let v = at(r);
            q = [0, 1].map(|i| q[i].zip(v[i]).map(|(a, b)| a + f * b));
        }
        for (i, a) in q.iter_mut().enumerate() {
            if a.is_some_and(|a| !a.is_finite()) {
                *a = Some(rescaled_sum(terms.iter().filter_map(|&(f, _, r)| at(r)[i].map(|b| (f, b)))));
            }
        }
        if q[0].is_none() || q[1].is_none() { [None, None] } else { q }
    };
    let mut plates = Vec::with_capacity(tr.plate_stresses.len());
    for (k, p) in tr.plate_stresses.iter().enumerate() {
        let t = plate_thickness.get(&p.element_id).copied().filter(|t| t.is_finite() && *t > 0.0).ok_or_else(|| {
            format!("Cannot combine the stresses of plate {}: its thickness is not given, and its principal and von Mises stresses depend on it", p.element_id)
        })?;
        let v = sum(&|r| { let x = &r.plate_stresses[k]; [x.sigma_xx, x.sigma_yy, x.tau_xy, x.mx, x.my, x.mxy] });
        let [qx, qy] = shear([p.qx, p.qy], &|r| [r.plate_stresses[k].qx, r.plate_stresses[k].qy]);
        let (sigma_1, sigma_2, von_mises) = crate::element::plate_worse_face(v[0], v[1], v[2], v[3], v[4], v[5], t);
        plates.push(PlateStress { element_id: p.element_id, sigma_xx: v[0], sigma_yy: v[1], tau_xy: v[2], mx: v[3], my: v[4], mxy: v[5], sigma_1, sigma_2, von_mises, nodal_von_mises: vec![], qx, qy });
    }
    let mut quads = Vec::with_capacity(tr.quad_stresses.len());
    for (k, q) in tr.quad_stresses.iter().enumerate() {
        let v = sum(&|r| { let x = &r.quad_stresses[k]; [x.sigma_xx, x.sigma_yy, x.tau_xy, x.mx, x.my, x.mxy] });
        let [qx, qy] = shear([q.qx, q.qy], &|r| [r.quad_stresses[k].qx, r.quad_stresses[k].qy]);
        quads.push(QuadStress { element_id: q.element_id, sigma_xx: v[0], sigma_yy: v[1], tau_xy: v[2], mx: v[3], my: v[4], mxy: v[5], von_mises: membrane_von_mises(v[0], v[1], v[2]), nodal_von_mises: vec![], qx, qy });
    }
    let mut nodal = Vec::with_capacity(tr.quad_nodal_stresses.len());
    for (k, n) in tr.quad_nodal_stresses.iter().enumerate() {
        let v = sum(&|r| { let x = &r.quad_nodal_stresses[k]; [x.sigma_xx, x.sigma_yy, x.tau_xy, x.mx, x.my, x.mxy] });
        let [qx, qy] = shear([n.qx, n.qy], &|r| [r.quad_nodal_stresses[k].qx, r.quad_nodal_stresses[k].qy]);
        nodal.push(QuadNodalStress { node_index: n.node_index, sigma_xx: v[0], sigma_yy: v[1], tau_xy: v[2], mx: v[3], my: v[4], mxy: v[5], von_mises: membrane_von_mises(v[0], v[1], v[2]), qx, qy });
    }
    let combined = CombinedShells { plates, quads, nodal };
    if let Some(at) = crate::certify::finite::non_finite_paths(&(&combined.plates, &combined.quads, &combined.nodal)).first() {
        return Err(format!("Cannot combine the shell stresses: the combined value at {at} is beyond the range of f64"));
    }
    Ok(combined)
}

pub(crate) fn combine_results_3d_refs_unchecked(factors: &[CombinationFactor], cases: &[(usize, &AnalysisResults3D)], plate_thickness: &PlateThicknesses) -> Result<Option<AnalysisResults3D>, String> {
    let resolved = ResolvedFactors::new(factors, cases)?;
    combine_resolved_results_3d(cases, &resolved, plate_thickness)
}

fn combine_resolved_results_3d(
    cases: &[(usize, &AnalysisResults3D)],
    resolved: &ResolvedFactors,
    plate_thickness: &PlateThicknesses,
) -> Result<Option<AnalysisResults3D>, String> {
    resolved.require_finite(cases)?;
    for (_, result) in cases {
        crate::boundary::require_finite(*result)?;
        for ef in &result.element_forces {
            super::diagrams_3d::validate_diagram_input_3d(ef)?;
        }
    }
    let Some(template) = cases.first() else { return Ok(None) };
    let tr = template.1;
    let aligned = align_result_fields(
        "Cannot combine results",
        "case",
        cases.iter().map(|&(id, result)| (id, EnvelopedFields::from(result))),
        |row| row.node_id,
        |row| row.node_id,
        |row| row.element_id,
    )?;

    let mut displacements: Vec<Displacement3D> = tr.displacements.iter()
        .map(|d| Displacement3D { node_id: d.node_id, ux: 0.0, uy: 0.0, uz: 0.0, rx: 0.0, ry: 0.0, rz: 0.0, warping: None })
        .collect();
    let mut reactions: Vec<Reaction3D> = tr.reactions.iter()
        .map(|r| Reaction3D { node_id: r.node_id, fx: 0.0, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bimoment: None })
        .collect();
    let mut element_forces: Vec<ElementForces3D> = tr.element_forces.iter()
        .map(|f| ElementForces3D {
            element_id: f.element_id, length: f.length,
            n_start: 0.0, n_end: 0.0,
            vy_start: 0.0, vy_end: 0.0, vz_start: 0.0, vz_end: 0.0,
            mx_start: 0.0, mx_end: 0.0, my_start: 0.0, my_end: 0.0, mz_start: 0.0, mz_end: 0.0,
            release_my_start: f.release_my_start, release_my_end: f.release_my_end,
            release_mz_start: f.release_mz_start, release_mz_end: f.release_mz_end,
            release_t_start: f.release_t_start, release_t_end: f.release_t_end,
            q_yi: 0.0, q_yj: 0.0, q_zi: 0.0, q_zj: 0.0,
            distributed_loads_y: Vec::new(), point_loads_y: Vec::new(),
            distributed_loads_x: Vec::new(),
            distributed_loads_z: Vec::new(), point_loads_x: Vec::new(), point_loads_z: Vec::new(), bimoment_start: None, bimoment_end: None })
        .collect();

    for &(f, slot) in &resolved.terms {
        let r = &aligned[slot];

        for (out, d) in displacements.iter_mut().zip(r.displacements.iter()) {
            out.ux += f * d.ux;
            out.uy += f * d.uy;
            out.uz += f * d.uz;
            out.rx += f * d.rx;
            out.ry += f * d.ry;
            out.rz += f * d.rz;
        }
        for (out, rx) in reactions.iter_mut().zip(r.reactions.iter()) {
            out.fx += f * rx.fx;
            out.fy += f * rx.fy;
            out.fz += f * rx.fz;
            out.mx += f * rx.mx;
            out.my += f * rx.my;
            out.mz += f * rx.mz;
        }
        for (out, ef) in element_forces.iter_mut().zip(r.element_forces.iter()) {
            out.n_start += f * ef.n_start;
            out.n_end += f * ef.n_end;
            out.vy_start += f * ef.vy_start;
            out.vy_end += f * ef.vy_end;
            out.vz_start += f * ef.vz_start;
            out.vz_end += f * ef.vz_end;
            out.mx_start += f * ef.mx_start;
            out.mx_end += f * ef.mx_end;
            out.my_start += f * ef.my_start;
            out.my_end += f * ef.my_end;
            out.mz_start += f * ef.mz_start;
            out.mz_end += f * ef.mz_end;
            out.q_yi += f * ef.q_yi;
            out.q_yj += f * ef.q_yj;
            out.q_zi += f * ef.q_zi;
            out.q_zj += f * ef.q_zj;
            for dl in distributed_actions(ef.length, &ef.distributed_loads_y, ef.q_yi, ef.q_yj) {
                out.distributed_loads_y.push(DistributedLoadInfo { q_i: dl.q_i * f, q_j: dl.q_j * f, a: dl.a, b: dl.b });
            }
            for dl in &ef.distributed_loads_x {
                out.distributed_loads_x.push(DistributedLoadInfo { q_i: dl.q_i * f, q_j: dl.q_j * f, a: dl.a, b: dl.b });
            }
            for dl in distributed_actions(ef.length, &ef.distributed_loads_z, ef.q_zi, ef.q_zj) {
                out.distributed_loads_z.push(DistributedLoadInfo { q_i: dl.q_i * f, q_j: dl.q_j * f, a: dl.a, b: dl.b });
            }
            for pl in &ef.point_loads_x {
                out.point_loads_x.push(PointLoadInfo3D { a: pl.a, p: pl.p * f });
            }
            for pl in &ef.point_loads_y {
                out.point_loads_y.push(PointLoadInfo3D { a: pl.a, p: pl.p * f });
            }
            for pl in &ef.point_loads_z {
                out.point_loads_z.push(PointLoadInfo3D { a: pl.a, p: pl.p * f });
            }
        }
    }

    let mut structured_diagnostics = Vec::new();
    let mut carried = Vec::new();
    let mut second_order = Vec::new();
    for (_, _, result) in resolved.contributions(cases) {
        let (small, others): (Vec<_>, Vec<_>) = crate::result_sites::known_issues(result).into_iter().partition(|d| d.phase.as_deref() == Some("LIN-SMALL-DISPLACEMENT"));
        let (second, others): (Vec<_>, Vec<_>) = others.into_iter().partition(crate::known_issues::is_second_order);
        carried.extend(small);
        second_order.extend(second);
        crate::known_issues::attach(&mut structured_diagnostics, others);
    }
    let ratio = crate::known_issues::combined_ratio(resolved.contributions(cases).map(|(factor, _, r)| (factor, r.result_summary.as_ref(), r.element_forces.iter().any(axial_3d))));
    crate::known_issues::attach(&mut structured_diagnostics, resolved.second_order_screen(&second_order, ratio));
    let terms: Vec<_> = resolved.contributions(cases).collect();
    let shells = combine_shells(&terms, terms.first().map_or((template.0, tr), |&(_, id, r)| (id, r)), plate_thickness)?;
    let mut combined = AnalysisResults3D { displacements, reactions, element_forces, plate_stresses: shells.plates, quad_stresses: shells.quads, quad_nodal_stresses: shells.nodal, constraint_forces: vec![], diagnostics: vec![], solver_diagnostics: vec![], structured_diagnostics, equilibrium: None, timings: None, result_summary: Some(ResultSummary { second_order_ratio: ratio, ..Default::default() }), solver_run_meta: None };
    check_result_fields("Cannot combine results", std::iter::once((0, EnvelopedFields {
        displacements: &combined.displacements, reactions: &combined.reactions, element_forces: &combined.element_forces,
    })))?;
    for ef in &combined.element_forces {
        super::diagrams_3d::validate_diagram_input_3d(ef)?;
    }
    let factored = resolved.contributions(cases).map(|(f, _, case)| (f, case.result_summary.as_ref()));
    let (beyond, chords, spans) = crate::known_issues::combined_small_displacement(crate::known_issues::rotated_nodes_3d(&combined), factored, &carried, |spans| crate::known_issues::span_rotations_3d(spans, &combined));
    crate::known_issues::attach(&mut combined.structured_diagnostics, beyond.into_iter().collect());
    let summary = combined.result_summary.get_or_insert_with(Default::default);
    summary.member_chords = chords;
    summary.member_spans = spans;
    Ok(Some(combined))
}

// ==================== 3D Envelope ====================

/// Compute pointwise 3D envelope. A single distorted-shell result is returned as it is; several
/// are refused, since the envelope cannot check their combined membrane stresses.
pub fn compute_envelope_3d(results: &[AnalysisResults3D]) -> Result<FullEnvelope3D, String> {
    for result in results {
        crate::known_issues::refuse_contained(&result.structured_diagnostics, result)?;
        if results.len() > 1 && crate::result_sites::known_issues(result).iter().any(|d| d.phase.as_deref() == Some("SH-MITC4-DISTORTION")) {
            crate::known_issues::refuse(&[crate::known_issues::diagnostic("SH-MITC4-DISTORTION")])?;
        }
    }
    compute_envelope_3d_checked(results)
}

pub(crate) fn compute_envelope_3d_checked(results: &[AnalysisResults3D]) -> Result<FullEnvelope3D, String> {
    let first = results.first().ok_or_else(|| "Cannot compute the envelope of no results".to_string())?;
    check_result_fields("Cannot compute the envelope", results.iter().enumerate().map(|(i, r)| {
        (i, EnvelopedFields::from(r))
    }))?;
    for result in results {
        for ef in &result.element_forces {
            super::diagrams_3d::validate_diagram_input_3d(ef)?;
        }
    }

    let aligned = align_result_fields(
        "Cannot compute the envelope",
        "result",
        results.iter().map(EnvelopedFields::from).enumerate(),
        |row| row.node_id,
        |row| row.node_id,
        |row| row.element_id,
    )?;
    let mut displacements = first.displacements.clone();
    let mut reactions = first.reactions.clone();
    let mut element_forces = first.element_forces.clone();

    for result in &aligned[1..] {
        for (out, d) in displacements.iter_mut().zip(result.displacements.iter()) {
            if d.ux.abs() > out.ux.abs() { out.ux = d.ux; }
            if d.uy.abs() > out.uy.abs() { out.uy = d.uy; }
            if d.uz.abs() > out.uz.abs() { out.uz = d.uz; }
            if d.rx.abs() > out.rx.abs() { out.rx = d.rx; }
            if d.ry.abs() > out.ry.abs() { out.ry = d.ry; }
            if d.rz.abs() > out.rz.abs() { out.rz = d.rz; }
        }
        for (out, rx) in reactions.iter_mut().zip(result.reactions.iter()) {
            if rx.fx.abs() > out.fx.abs() { out.fx = rx.fx; }
            if rx.fy.abs() > out.fy.abs() { out.fy = rx.fy; }
            if rx.fz.abs() > out.fz.abs() { out.fz = rx.fz; }
            if rx.mx.abs() > out.mx.abs() { out.mx = rx.mx; }
            if rx.my.abs() > out.my.abs() { out.my = rx.my; }
            if rx.mz.abs() > out.mz.abs() { out.mz = rx.mz; }
        }
        for (out, ef) in element_forces.iter_mut().zip(result.element_forces.iter()) {
            if ef.n_start.abs() > out.n_start.abs() { out.n_start = ef.n_start; }
            if ef.n_end.abs() > out.n_end.abs() { out.n_end = ef.n_end; }
            if ef.vy_start.abs() > out.vy_start.abs() { out.vy_start = ef.vy_start; }
            if ef.vy_end.abs() > out.vy_end.abs() { out.vy_end = ef.vy_end; }
            if ef.vz_start.abs() > out.vz_start.abs() { out.vz_start = ef.vz_start; }
            if ef.vz_end.abs() > out.vz_end.abs() { out.vz_end = ef.vz_end; }
            if ef.mx_start.abs() > out.mx_start.abs() { out.mx_start = ef.mx_start; }
            if ef.mx_end.abs() > out.mx_end.abs() { out.mx_end = ef.mx_end; }
            if ef.my_start.abs() > out.my_start.abs() { out.my_start = ef.my_start; }
            if ef.my_end.abs() > out.my_end.abs() { out.my_end = ef.my_end; }
            if ef.mz_start.abs() > out.mz_start.abs() { out.mz_start = ef.mz_start; }
            if ef.mz_end.abs() > out.mz_end.abs() { out.mz_end = ef.mz_end; }
        }
    }

    let mut structured_diagnostics = Vec::new();
    for result in results {
        crate::known_issues::attach(&mut structured_diagnostics, crate::result_sites::known_issues(result));
    }
    let max_abs_results_3d = AnalysisResults3D { displacements, reactions, element_forces, plate_stresses: vec![], quad_stresses: vec![], quad_nodal_stresses: vec![], constraint_forces: vec![], diagnostics: vec![], solver_diagnostics: vec![], structured_diagnostics, equilibrium: None, timings: None, result_summary: None, solver_run_meta: None };

    fn compute_env_3d(kind: &str, results: &[AlignedResultFields<'_, Displacement3D, Reaction3D, ElementForces3D>]) -> Result<EnvelopeDiagramData, String> {
        let first = &results[0];
        let mut elements = Vec::new();
        let mut global_max = 0.0f64;

        for (e_idx, ef) in first.element_forces.iter().enumerate() {
            let cases: Vec<_> = results.iter().map(|res| &res.element_forces[e_idx]).collect();
            let (element, peak) = member_envelope(
                kind, ef.element_id, &cases,
                |forces| diagram_critical_cuts_3d(forces, kind),
                |forces, cut| try_evaluate_diagram_cut_3d(forces, kind, cut),
            )?;
            elements.push(element);
            global_max = global_max.max(peak);
        }

        Ok(EnvelopeDiagramData { kind: kind.to_string(), elements, global_max })
    }

    Ok(FullEnvelope3D {
        moment_y: compute_env_3d("momentY", &aligned)?,
        moment_z: compute_env_3d("momentZ", &aligned)?,
        shear_y: compute_env_3d("shearY", &aligned)?,
        shear_z: compute_env_3d("shearZ", &aligned)?,
        axial: compute_env_3d("axial", &aligned)?,
        torsion: compute_env_3d("torsion", &aligned)?,
        max_abs_results_3d,
    })
}
