//! Certified load combinations and envelopes. See "Load combinations and
//! envelopes" in `docs/verification/CERTIFY.md`.
//!
//! A combination is `Σ cᵢ · (case i)`. Its exact value is defined as the same
//! linear combination of the exact case solutions `u*ᵢ` (equivalently, the exact
//! solution for the combined loads: the reduced system is linear in `f`).
//!
//! * Displacements: `‖Σcᵢu*ᵢ − ũ_c‖₂ ≤ Σ|cᵢ|·bᵢ + ‖Σcᵢũᵢ − ũ_c‖₂`, where `bᵢ`
//!   is case i's certified bound and the second term (the f64 rounding of the
//!   combination itself) is enclosed by evaluating `Σcᵢũᵢ` in interval
//!   arithmetic against the reported `ũ_c`.
//! * Member end forces are affine in the displacements with load terms that do
//!   not depend on them, so the same argument applies per force component with
//!   the per-case force bounds of `forces.rs`.
//! * Diagram values: each case's station bound (`stations.rs`, valid at every x)
//!   combines the same way, `Σ|cᵢ|·Sᵢ`, plus the rounding of the combined start
//!   forces the diagram formula reads (`δM + L·δV` for moments).
//! * Deflection curves: the per-member factor of `deflection.rs` times the
//!   combination's displacement bound. Reactions: `Σ|cᵢ|·Rᵢ` plus the rounding
//!   of the combination, like the end forces.
//! * Envelopes (max/min, max-abs over combinations) are 1-Lipschitz in the
//!   sup-norm, so the envelope error is at most the largest combination bound.
//!
//! Inherited limitation (as in `forces.rs`): rounding in the f64 evaluation of
//! each case's force formulas and of the diagram polynomials is not included.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::deflection::{deflection_bounds, deflection_factors_2d, deflection_factors_3d, DeflectionBound};
use super::forces::{force_bounds_2d, force_bounds_3d, ForceBound2D, ForceBound3D};
use super::interval::Interval;
use super::linear::Certificate;
use super::reactions::{
    reaction_bounds_2d_with, reaction_bounds_3d_with, restrained_rows_2d, restrained_rows_3d, ReactionBound2D,
    ReactionBound3D,
};
use super::solver::{certify_load_cases_2d, certify_load_cases_3d, ShownBounds};
pub use super::stations::{StationBound2D, StationBound3D};
use super::stations::{
    station_from_rows_2d, station_from_rows_3d, station_rows_2d, station_rows_3d, with_gaps_2d, with_gaps_3d,
};
use crate::solver::linear::expand_curved_beams_3d;
use crate::solver::load_cases::{
    solve_multi_case_2d, solve_multi_case_3d, CombinationDef, MultiCaseInput, MultiCaseInput3D,
    MultiCaseResult, MultiCaseResult3D,
};
use crate::types::*;

#[inline]
fn up(x: f64) -> f64 {
    x.next_up()
}

// ───────────────────────────── output types ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseCertificate2D {
    pub name: String,
    pub certificate: Certificate,
    pub force_bounds: Vec<ForceBound2D>,
    #[serde(flatten)]
    pub shown: ShownBounds<StationBound2D, ReactionBound2D>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseCertificate3D {
    pub name: String,
    pub certificate: Certificate,
    pub force_bounds: Vec<ForceBound3D>,
    #[serde(flatten)]
    pub shown: ShownBounds<StationBound3D, ReactionBound3D>,
}

/// Certified bounds for one combination (or for the envelope). When
/// `certified` is false every bound is absent/empty and `reason` says why.
/// A member missing from `force_bounds` has no certified bound.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombinationCertificate2D {
    pub name: String,
    pub certified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// Upper bound on the 2-norm of the displacement error (hence on every
    /// displacement component's error).
    pub disp_abs_bound: Option<f64>,
    /// End-force bounds (both ends).
    pub force_bounds: Vec<ForceBound2D>,
    /// Diagram bounds valid at every x along the member (gaps: combinations only).
    pub station_bounds: Vec<StationBound2D>,
    /// Deflection-curve bounds per member.
    #[serde(default)]
    pub deflection_bounds: Vec<DeflectionBound>,
    /// Reaction bounds per node (nodes bounded in every case with a non-zero factor).
    #[serde(default)]
    pub reaction_bounds: Vec<ReactionBound2D>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombinationCertificate3D {
    pub name: String,
    pub certified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub disp_abs_bound: Option<f64>,
    pub force_bounds: Vec<ForceBound3D>,
    pub station_bounds: Vec<StationBound3D>,
    #[serde(default)]
    pub deflection_bounds: Vec<DeflectionBound>,
    #[serde(default)]
    pub reaction_bounds: Vec<ReactionBound3D>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedMultiCase2D {
    pub results: MultiCaseResult,
    pub cases: Vec<CaseCertificate2D>,
    pub combinations: Vec<CombinationCertificate2D>,
    /// Bounds for `results.envelope` (max-abs results and envelope diagrams).
    pub envelope: CombinationCertificate2D,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedMultiCase3D {
    pub results: MultiCaseResult3D,
    pub cases: Vec<CaseCertificate3D>,
    pub combinations: Vec<CombinationCertificate3D>,
    pub envelope: CombinationCertificate3D,
}

// ───────────────────────────── generic core ─────────────────────────────

/// One case reduced to arrays: D displacement components per node, K force
/// components per element (start and end values), S diagram bounds per
/// element, R reaction components per node.
struct CaseData<const D: usize, const K: usize, const S: usize, const R: usize> {
    name: String,
    abs_bound: Result<f64, String>,
    disp: HashMap<usize, [f64; D]>,
    forces: HashMap<usize, ([f64; K], [f64; K])>,
    force_bounds: HashMap<usize, [f64; K]>,
    station_bounds: HashMap<usize, [f64; S]>,
    reactions: HashMap<usize, [f64; R]>,
    reaction_bounds: HashMap<usize, [f64; R]>,
}

/// Displacements by node and (start, end) forces by element.
type Indexed<const D: usize, const K: usize> = (HashMap<usize, [f64; D]>, HashMap<usize, ([f64; K], [f64; K])>);

/// Combination bounds: displacement 2-norm bound, per-element force and
/// diagram bounds, per-node reaction bounds.
struct ComboBounds<const K: usize, const S: usize, const R: usize> {
    disp: f64,
    forces: Vec<(usize, [f64; K])>,
    stations: Vec<(usize, [f64; S])>,
    reactions: Vec<(usize, [f64; R])>,
}

/// The reported combination, reduced to arrays.
struct ComboData<'a, const D: usize, const K: usize, const R: usize> {
    disp: &'a HashMap<usize, [f64; D]>,
    forces: &'a HashMap<usize, ([f64; K], [f64; K])>,
    reactions: &'a HashMap<usize, [f64; R]>,
    lengths: &'a HashMap<usize, f64>,
    /// Diagram rounding from the end-force rounding `δ` (per component) and length.
    station_dev: fn(&[f64; K], f64) -> Vec<f64>,
}

/// `Σ cᵢ xᵢ` in interval arithmetic minus the reported value, as |·| bound.
fn rounding_dev(terms: impl Iterator<Item = (f64, f64)>, reported: f64) -> f64 {
    let mut acc = Interval::ZERO;
    for (c, x) in terms {
        acc = acc + Interval::point(c) * Interval::point(x);
    }
    let d = (acc - Interval::point(reported)).mag();
    if d.is_finite() { d } else { f64::INFINITY }
}

fn certify_combo<const D: usize, const K: usize, const S: usize, const R: usize>(
    factors: &[(usize, f64)],
    cases: &[CaseData<D, K, S, R>],
    combo: &ComboData<D, K, R>,
) -> Result<ComboBounds<K, S, R>, String> {
    // Exactly-zero factors contribute exactly zero and need no certificate.
    let factors: Vec<(usize, f64)> = factors.iter().copied().filter(|&(_, c)| c != 0.0).collect();
    let mut disp = 0.0f64;
    for &(i, c) in &factors {
        if !c.is_finite() {
            return Err(format!("non-finite factor {c} for case '{}'", cases[i].name));
        }
        let b = cases[i].abs_bound.as_ref().map_err(|r| format!("case '{}' uncertified: {r}", cases[i].name))?;
        disp = up(disp + up(c.abs() * b));
    }
    // Rounding of the combination itself, over every reported component.
    let mut dev2 = 0.0f64;
    for (node, rep) in combo.disp {
        for (k, &r) in rep.iter().enumerate() {
            let mut terms = Vec::with_capacity(factors.len());
            for &(i, c) in &factors {
                let Some(u) = cases[i].disp.get(node) else {
                    return Err(format!("case '{}' has no displacement for node {node}", cases[i].name));
                };
                terms.push((c, u[k]));
            }
            let d = rounding_dev(terms.into_iter(), r);
            dev2 = up(dev2 + up(d * d));
        }
    }
    disp = up(disp + up(dev2.sqrt()));
    if !disp.is_finite() {
        return Err("non-finite displacement bound".into());
    }

    let mut forces = Vec::new();
    let mut stations = Vec::new();
    'elem: for (&eid, (rs, re)) in combo.forces {
        let mut b = [0.0f64; K];
        let mut sb = [0.0f64; S];
        let mut has_stations = true;
        let mut ts: Vec<Vec<(f64, f64)>> = vec![Vec::new(); 2 * K];
        for &(i, c) in &factors {
            let (Some(fb), Some((s, e))) = (cases[i].force_bounds.get(&eid), cases[i].forces.get(&eid)) else {
                continue 'elem; // no certified force bound for this member
            };
            for k in 0..K {
                b[k] = up(b[k] + up(c.abs() * fb[k]));
                ts[k].push((c, s[k]));
                ts[K + k].push((c, e[k]));
            }
            match cases[i].station_bounds.get(&eid) {
                Some(st) => (0..S).for_each(|k| sb[k] = up(sb[k] + up(c.abs() * st[k]))),
                None => has_stations = false,
            }
        }
        let mut delta = [0.0f64; K];
        for k in 0..K {
            let ds = rounding_dev(ts[k].iter().copied(), rs[k]);
            let de = rounding_dev(ts[K + k].iter().copied(), re[k]);
            delta[k] = ds.max(de);
            b[k] = up(b[k] + delta[k]);
        }
        if b.iter().all(|x| x.is_finite()) {
            forces.push((eid, b));
        }
        if let (true, Some(&l)) = (has_stations, combo.lengths.get(&eid)) {
            for (k, d) in (combo.station_dev)(&delta, l).into_iter().enumerate() {
                sb[k] = up(sb[k] + d);
            }
            if sb.iter().all(|x| x.is_finite()) {
                stations.push((eid, sb));
            }
        }
    }
    forces.sort_by_key(|f| f.0);
    stations.sort_by_key(|f| f.0);

    let mut reactions = Vec::new();
    'node: for (&node, rep) in combo.reactions {
        let mut b = [0.0f64; R];
        let mut ts: Vec<Vec<(f64, f64)>> = vec![Vec::new(); R];
        for &(i, c) in &factors {
            let (Some(rb), Some(r)) = (cases[i].reaction_bounds.get(&node), cases[i].reactions.get(&node)) else {
                continue 'node;
            };
            for k in 0..R {
                b[k] = up(b[k] + up(c.abs() * rb[k]));
                ts[k].push((c, r[k]));
            }
        }
        for k in 0..R {
            b[k] = up(b[k] + rounding_dev(ts[k].iter().copied(), rep[k]));
        }
        if b.iter().all(|x| x.is_finite()) {
            reactions.push((node, b));
        }
    }
    reactions.sort_by_key(|f| f.0);
    Ok(ComboBounds { disp, forces, stations, reactions })
}

/// Componentwise max over keyed bounds, keeping the keys every list has.
fn max_keyed<const N: usize>(lists: &[&Vec<(usize, [f64; N])>]) -> Vec<(usize, [f64; N])> {
    let mut acc: HashMap<usize, ([f64; N], usize)> = HashMap::new();
    for list in lists {
        for (key, b) in *list {
            let e = acc.entry(*key).or_insert(([0.0; N], 0));
            for k in 0..N {
                e.0[k] = e.0[k].max(b[k]);
            }
            e.1 += 1;
        }
    }
    let mut out: Vec<(usize, [f64; N])> =
        acc.into_iter().filter(|(_, (_, n))| *n == lists.len()).map(|(e, (b, _))| (e, b)).collect();
    out.sort_by_key(|f| f.0);
    out
}

/// Envelope bound: componentwise max over all combinations. Requires every
/// combination certified, and an element (node) is kept only if every
/// combination bounds it.
fn envelope_bounds<const K: usize, const S: usize, const R: usize>(
    combos: &[Result<ComboBounds<K, S, R>, String>],
) -> Result<ComboBounds<K, S, R>, String> {
    let mut disp = 0.0f64;
    let mut ok = Vec::with_capacity(combos.len());
    for (idx, c) in combos.iter().enumerate() {
        let c = c.as_ref().map_err(|r| format!("combination {idx} uncertified: {r}"))?;
        disp = disp.max(c.disp);
        ok.push(c);
    }
    Ok(ComboBounds {
        disp,
        forces: max_keyed(&ok.iter().map(|c| &c.forces).collect::<Vec<_>>()),
        stations: max_keyed(&ok.iter().map(|c| &c.stations).collect::<Vec<_>>()),
        reactions: max_keyed(&ok.iter().map(|c| &c.reactions).collect::<Vec<_>>()),
    })
}

pub(super) fn factor_list(def: &CombinationDef, case_names: &[&str]) -> Result<Vec<(usize, f64)>, String> {
    let mut out: Vec<(usize, f64)> = def
        .factors
        .iter()
        .map(|(name, &c)| {
            case_names
                .iter()
                .position(|n| n == name)
                .map(|i| (i, c))
                .ok_or_else(|| format!("unknown load case '{name}'"))
        })
        .collect::<Result<_, _>>()?;
    out.sort_by_key(|f| f.0);
    Ok(out)
}

// ─────────────────────────────── 2D ───────────────────────────────

fn disp2(d: &Displacement) -> [f64; 3] {
    [d.ux, d.uz, d.ry]
}

pub(super) fn forces2(f: &ElementForces) -> ([f64; 3], [f64; 3]) {
    ([f.n_start, f.v_start, f.m_start], [f.n_end, f.v_end, f.m_end])
}

pub(super) fn fb2_arr(b: &ForceBound2D) -> [f64; 3] {
    [b.n, b.v, b.m]
}

fn arr_fb2(eid: usize, b: [f64; 3]) -> ForceBound2D {
    ForceBound2D { element_id: eid, n: b[0], v: b[1], m: b[2] }
}

fn index2(r: &AnalysisResults) -> Indexed<3, 3> {
    (
        r.displacements.iter().map(|d| (d.node_id, disp2(d))).collect(),
        r.element_forces.iter().map(|f| (f.element_id, forces2(f))).collect(),
    )
}

fn reactions2(r: &AnalysisResults) -> HashMap<usize, [f64; 3]> {
    r.reactions.iter().map(|x| (x.node_id, [x.rx, x.rz, x.my])).collect()
}

fn sb2_arr(b: &StationBound2D) -> [f64; 3] {
    [b.axial, b.shear, b.moment]
}

fn rb2_arr(b: &ReactionBound2D) -> [f64; 3] {
    [b.rx, b.rz, b.my]
}

/// Diagram rounding from the end-force rounding δ = [δN, δV, δM]: M(x) reads
/// M_start and V_start (x ≤ L), N and V their start (TS: and end) values.
fn station_dev_2d(d: &[f64; 3], l: f64) -> Vec<f64> {
    vec![d[0], d[1], up(d[2] + up(d[1] * l.abs()))]
}

fn combo_cert_2d(
    name: &str,
    r: Result<&ComboBounds<3, 3, 3>, String>,
    factors: &HashMap<usize, f64>,
    forces: Option<&[ElementForces]>,
) -> CombinationCertificate2D {
    match r {
        Ok(c) => {
            let mut station_bounds: Vec<StationBound2D> = c
                .stations
                .iter()
                .map(|(e, b)| StationBound2D { element_id: *e, axial: b[0], shear: b[1], moment: b[2], gaps: None })
                .collect();
            if let Some(f) = forces {
                with_gaps_2d(&mut station_bounds, f);
            }
            CombinationCertificate2D {
                name: name.to_string(),
                certified: true,
                reason: None,
                disp_abs_bound: Some(c.disp),
                force_bounds: c.forces.iter().map(|(e, b)| arr_fb2(*e, *b)).collect(),
                station_bounds,
                deflection_bounds: deflections_of(factors, c.disp),
                reaction_bounds: c
                    .reactions
                    .iter()
                    .map(|(n, b)| ReactionBound2D { node_id: *n, rx: b[0], rz: b[1], my: b[2] })
                    .collect(),
            }
        }
        Err(reason) => CombinationCertificate2D {
            name: name.to_string(),
            certified: false,
            reason: Some(reason),
            disp_abs_bound: None,
            force_bounds: vec![],
            station_bounds: vec![],
            deflection_bounds: vec![],
            reaction_bounds: vec![],
        },
    }
}

fn deflections_of(factors: &HashMap<usize, f64>, disp: f64) -> Vec<DeflectionBound> {
    let mut f: Vec<(usize, f64)> = factors.iter().map(|(&e, &x)| (e, x)).collect();
    f.sort_by_key(|x| x.0);
    deflection_bounds(&f, disp)
}

fn lengths_of<'a>(forces: impl Iterator<Item = (usize, f64)> + 'a) -> HashMap<usize, f64> {
    let mut lengths: HashMap<usize, f64> = HashMap::new();
    for (eid, len) in forces {
        let l = lengths.entry(eid).or_insert(0.0);
        *l = l.max(len.abs());
    }
    lengths
}

/// Solve a 2D multi-case model (`solve_multi_case_2d`) and certify its cases,
/// combinations and envelope.
pub fn certify_multi_case_2d(input: &MultiCaseInput) -> Result<CertifiedMultiCase2D, String> {
    let results = solve_multi_case_2d(input)?;
    Ok(certify_multi_case_results_2d(input, results))
}

/// Certify given results of `solve_multi_case_2d(input)`.
pub fn certify_multi_case_results_2d(input: &MultiCaseInput, results: MultiCaseResult) -> CertifiedMultiCase2D {
    let n_cases = input.load_cases.len();
    let structural = || -> Result<(), String> {
        if results.case_results.len() != n_cases
            || results.case_results.iter().zip(&input.load_cases).any(|(r, c)| r.name != c.name)
        {
            return Err("case results do not match the input load cases".into());
        }
        if results.combination_results.len() != input.combinations.len()
            || results.combination_results.iter().zip(&input.combinations).any(|(r, c)| r.name != c.name)
        {
            return Err("combination results do not match the input combinations".into());
        }
        Ok(())
    }();

    let case_pairs: Vec<(&[SolverLoad], &AnalysisResults)> = input
        .load_cases
        .iter()
        .zip(&results.case_results)
        .map(|(lc, cr)| (lc.loads.as_slice(), &cr.results))
        .collect();
    let certs = match &structural {
        Ok(()) => certify_load_cases_2d(&input.solver, &case_pairs),
        Err(r) => vec![Certificate::uncertified(r.clone()); case_pairs.len()],
    };
    // Shared by every case: the stiffness rows behind the diagram bounds, the
    // deflection factors, the restrained rows behind the reactions.
    let rows = station_rows_2d(&input.solver);
    let dfactors: HashMap<usize, f64> = deflection_factors_2d(&input.solver).into_iter().collect();
    let restrained = restrained_rows_2d(&input.solver);
    let cases: Vec<CaseCertificate2D> = input
        .load_cases
        .iter()
        .zip(&case_pairs)
        .zip(certs)
        .map(|((lc, (loads, res)), certificate)| {
            let Some(b) = certificate.abs_bound() else {
                return CaseCertificate2D {
                    name: lc.name.clone(), certificate, force_bounds: vec![], shown: Default::default(),
                };
            };
            let mut station_bounds: Vec<StationBound2D> =
                rows.iter().map(|(e, r)| station_from_rows_2d(*e, r, b)).collect();
            with_gaps_2d(&mut station_bounds, &res.element_forces);
            let (reaction_bounds, reaction_reason) = match &restrained {
                Ok((dof, rr)) => match reaction_bounds_2d_with(&input.solver, dof, rr, loads, res, b) {
                    Ok(r) => (r, None),
                    Err(e) => (vec![], Some(e)),
                },
                Err(e) => (vec![], Some(e.clone())),
            };
            CaseCertificate2D {
                name: lc.name.clone(),
                force_bounds: force_bounds_2d(&input.solver, b),
                shown: ShownBounds {
                    station_bounds,
                    deflection_bounds: deflections_of(&dfactors, b),
                    reaction_bounds,
                    reaction_reason,
                },
                certificate,
            }
        })
        .collect();
    let data: Vec<CaseData<3, 3, 3, 3>> = cases
        .iter()
        .zip(&case_pairs)
        .map(|(c, (_, r))| {
            let (disp, forces) = index2(r);
            CaseData {
                name: c.name.clone(),
                abs_bound: match &c.certificate {
                    Certificate::Certified { abs_bound, .. } => Ok(*abs_bound),
                    Certificate::Uncertified { reason } => Err(reason.clone()),
                },
                disp,
                forces,
                force_bounds: c.force_bounds.iter().map(|b| (b.element_id, fb2_arr(b))).collect(),
                station_bounds: c.shown.station_bounds.iter().map(|b| (b.element_id, sb2_arr(b))).collect(),
                reactions: reactions2(r),
                reaction_bounds: c.shown.reaction_bounds.iter().map(|b| (b.node_id, rb2_arr(b))).collect(),
            }
        })
        .collect();

    let lengths = lengths_of(
        results.combination_results.iter().flat_map(|cr| cr.results.element_forces.iter().map(|f| (f.element_id, f.length))),
    );
    let names: Vec<&str> = input.load_cases.iter().map(|c| c.name.as_str()).collect();
    let bounds: Vec<Result<ComboBounds<3, 3, 3>, String>> = input
        .combinations
        .iter()
        .enumerate()
        .map(|(i, def)| {
            structural.clone()?;
            let factors = factor_list(def, &names)?;
            let cr = &results.combination_results[i].results;
            let (disp, forces) = index2(cr);
            let reactions = reactions2(cr);
            let combo = ComboData { disp: &disp, forces: &forces, reactions: &reactions, lengths: &lengths, station_dev: station_dev_2d };
            certify_combo(&factors, &data, &combo)
        })
        .collect();

    let combinations = input
        .combinations
        .iter()
        .enumerate()
        .zip(&bounds)
        .map(|((i, def), b)| {
            let forces = results.combination_results.get(i).map(|r| r.results.element_forces.as_slice());
            combo_cert_2d(&def.name, b.as_ref().map_err(|e| e.clone()), &dfactors, forces)
        })
        .collect();
    let env = envelope_aligned_2d(&results).and_then(|()| envelope_bounds(&bounds));
    let envelope = combo_cert_2d("envelope", env.as_ref().map_err(|e| e.clone()), &dfactors, None);
    CertifiedMultiCase2D { results, cases, combinations, envelope }
}

/// `compute_envelope` pairs entries by position; require identical id order.
fn envelope_aligned_2d(results: &MultiCaseResult) -> Result<(), String> {
    let Some(first) = results.combination_results.first() else {
        return Err("no combinations".into());
    };
    let nodes: Vec<usize> = first.results.displacements.iter().map(|d| d.node_id).collect();
    let elems: Vec<usize> = first.results.element_forces.iter().map(|f| f.element_id).collect();
    for c in &results.combination_results {
        if !c.results.displacements.iter().map(|d| d.node_id).eq(nodes.iter().copied())
            || !c.results.element_forces.iter().map(|f| f.element_id).eq(elems.iter().copied())
        {
            return Err("combination results are not aligned by id".into());
        }
    }
    Ok(())
}

// ─────────────────────────────── 3D ───────────────────────────────

fn disp3(d: &Displacement3D) -> [f64; 6] {
    [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz]
}

pub(super) fn forces3(f: &ElementForces3D) -> ([f64; 6], [f64; 6]) {
    (
        [f.n_start, f.vy_start, f.vz_start, f.mx_start, f.my_start, f.mz_start],
        [f.n_end, f.vy_end, f.vz_end, f.mx_end, f.my_end, f.mz_end],
    )
}

pub(super) fn fb3_arr(b: &ForceBound3D) -> [f64; 6] {
    [b.n, b.vy, b.vz, b.t, b.my, b.mz]
}

/// Combinations bound the six classical components; the warping bimoment is
/// not combined, so it is reported unbounded (∞, serialized as null).
fn arr_fb3(eid: usize, b: [f64; 6]) -> ForceBound3D {
    ForceBound3D { element_id: eid, n: b[0], vy: b[1], vz: b[2], t: b[3], my: b[4], mz: b[5], bimoment: f64::INFINITY }
}

fn index3(r: &AnalysisResults3D) -> Indexed<6, 6> {
    (
        r.displacements.iter().map(|d| (d.node_id, disp3(d))).collect(),
        r.element_forces.iter().map(|f| (f.element_id, forces3(f))).collect(),
    )
}

fn reactions3(r: &AnalysisResults3D) -> HashMap<usize, [f64; 6]> {
    r.reactions.iter().map(|x| (x.node_id, [x.fx, x.fy, x.fz, x.mx, x.my, x.mz])).collect()
}

fn sb3_arr(b: &StationBound3D) -> [f64; 6] {
    [b.axial, b.shear_y, b.shear_z, b.torsion, b.moment_y, b.moment_z]
}

fn rb3_arr(b: &ReactionBound3D) -> [f64; 6] {
    [b.fx, b.fy, b.fz, b.mx, b.my, b.mz]
}

/// δ = [δN, δVy, δVz, δT, δMy, δMz]: My(x) reads My_start, Vz_start; Mz(x) Mz_start, Vy_start.
fn station_dev_3d(d: &[f64; 6], l: f64) -> Vec<f64> {
    let l = l.abs();
    vec![d[0], d[1], d[2], d[3], up(d[4] + up(d[2] * l)), up(d[5] + up(d[1] * l))]
}

fn combo_cert_3d(
    name: &str,
    r: Result<&ComboBounds<6, 6, 6>, String>,
    factors: &HashMap<usize, f64>,
    forces: Option<&[ElementForces3D]>,
) -> CombinationCertificate3D {
    match r {
        Ok(c) => {
            let mut station_bounds: Vec<StationBound3D> = c
                .stations
                .iter()
                .map(|(e, b)| StationBound3D {
                    element_id: *e, axial: b[0], shear_y: b[1], shear_z: b[2], torsion: b[3],
                    moment_y: b[4], moment_z: b[5], gaps: None,
                })
                .collect();
            if let Some(f) = forces {
                with_gaps_3d(&mut station_bounds, f);
            }
            CombinationCertificate3D {
                name: name.to_string(),
                certified: true,
                reason: None,
                disp_abs_bound: Some(c.disp),
                force_bounds: c.forces.iter().map(|(e, b)| arr_fb3(*e, *b)).collect(),
                station_bounds,
                deflection_bounds: deflections_of(factors, c.disp),
                reaction_bounds: c
                    .reactions
                    .iter()
                    .map(|(n, b)| ReactionBound3D { node_id: *n, fx: b[0], fy: b[1], fz: b[2], mx: b[3], my: b[4], mz: b[5] })
                    .collect(),
            }
        }
        Err(reason) => CombinationCertificate3D {
            name: name.to_string(),
            certified: false,
            reason: Some(reason),
            disp_abs_bound: None,
            force_bounds: vec![],
            station_bounds: vec![],
            deflection_bounds: vec![],
            reaction_bounds: vec![],
        },
    }
}

/// Solve a 3D multi-case model (`solve_multi_case_3d`) and certify its cases,
/// combinations and envelope.
pub fn certify_multi_case_3d(input: &MultiCaseInput3D) -> Result<CertifiedMultiCase3D, String> {
    let results = solve_multi_case_3d(input)?;
    Ok(certify_multi_case_results_3d(input, results))
}

/// Certify given results of `solve_multi_case_3d(input)`.
pub fn certify_multi_case_results_3d(input: &MultiCaseInput3D, results: MultiCaseResult3D) -> CertifiedMultiCase3D {
    let n_cases = input.load_cases.len();
    let structural = || -> Result<(), String> {
        if results.case_results.len() != n_cases
            || results.case_results.iter().zip(&input.load_cases).any(|(r, c)| r.name != c.name)
        {
            return Err("case results do not match the input load cases".into());
        }
        if results.combination_results.len() != input.combinations.len()
            || results.combination_results.iter().zip(&input.combinations).any(|(r, c)| r.name != c.name)
        {
            return Err("combination results do not match the input combinations".into());
        }
        Ok(())
    }();

    let case_pairs: Vec<(&[SolverLoad3D], &AnalysisResults3D)> = input
        .load_cases
        .iter()
        .zip(&results.case_results)
        .map(|(lc, cr)| (lc.loads.as_slice(), &cr.results))
        .collect();
    let certs = match &structural {
        Ok(()) => certify_load_cases_3d(&input.solver, &case_pairs),
        Err(r) => vec![Certificate::uncertified(r.clone()); case_pairs.len()],
    };
    let expanded = expand_curved_beams_3d(&input.solver);
    let rows = station_rows_3d(&expanded);
    let dfactors: HashMap<usize, f64> = deflection_factors_3d(&expanded).into_iter().collect();
    let restrained = restrained_rows_3d(&expanded);
    let cases: Vec<CaseCertificate3D> = input
        .load_cases
        .iter()
        .zip(&case_pairs)
        .zip(certs)
        .map(|((lc, (loads, res)), certificate)| {
            let Some(b) = certificate.abs_bound() else {
                return CaseCertificate3D {
                    name: lc.name.clone(), certificate, force_bounds: vec![], shown: Default::default(),
                };
            };
            let mut station_bounds: Vec<StationBound3D> =
                rows.iter().map(|(e, r)| station_from_rows_3d(*e, r, b)).collect();
            with_gaps_3d(&mut station_bounds, &res.element_forces);
            let (reaction_bounds, reaction_reason) = match &restrained {
                Ok((dof, rr, sparse)) => match reaction_bounds_3d_with(&expanded, dof, rr, *sparse, loads, res, b) {
                    Ok(r) => (r, None),
                    Err(e) => (vec![], Some(e)),
                },
                Err(e) => (vec![], Some(e.clone())),
            };
            CaseCertificate3D {
                name: lc.name.clone(),
                force_bounds: force_bounds_3d(&expanded, b),
                shown: ShownBounds {
                    station_bounds,
                    deflection_bounds: deflections_of(&dfactors, b),
                    reaction_bounds,
                    reaction_reason,
                },
                certificate,
            }
        })
        .collect();
    let data: Vec<CaseData<6, 6, 6, 6>> = cases
        .iter()
        .zip(&case_pairs)
        .map(|(c, (_, r))| {
            let (disp, forces) = index3(r);
            CaseData {
                name: c.name.clone(),
                abs_bound: match &c.certificate {
                    Certificate::Certified { abs_bound, .. } => Ok(*abs_bound),
                    Certificate::Uncertified { reason } => Err(reason.clone()),
                },
                disp,
                forces,
                force_bounds: c.force_bounds.iter().map(|b| (b.element_id, fb3_arr(b))).collect(),
                station_bounds: c.shown.station_bounds.iter().map(|b| (b.element_id, sb3_arr(b))).collect(),
                reactions: reactions3(r),
                reaction_bounds: c.shown.reaction_bounds.iter().map(|b| (b.node_id, rb3_arr(b))).collect(),
            }
        })
        .collect();

    let lengths = lengths_of(
        results.combination_results.iter().flat_map(|cr| cr.results.element_forces.iter().map(|f| (f.element_id, f.length))),
    );
    let names: Vec<&str> = input.load_cases.iter().map(|c| c.name.as_str()).collect();
    let bounds: Vec<Result<ComboBounds<6, 6, 6>, String>> = input
        .combinations
        .iter()
        .enumerate()
        .map(|(i, def)| {
            structural.clone()?;
            let factors = factor_list(def, &names)?;
            let cr = &results.combination_results[i].results;
            let (disp, forces) = index3(cr);
            let reactions = reactions3(cr);
            let combo = ComboData { disp: &disp, forces: &forces, reactions: &reactions, lengths: &lengths, station_dev: station_dev_3d };
            certify_combo(&factors, &data, &combo)
        })
        .collect();

    let combinations = input
        .combinations
        .iter()
        .enumerate()
        .zip(&bounds)
        .map(|((i, def), b)| {
            let forces = results.combination_results.get(i).map(|r| r.results.element_forces.as_slice());
            combo_cert_3d(&def.name, b.as_ref().map_err(|e| e.clone()), &dfactors, forces)
        })
        .collect();
    let env = envelope_aligned_3d(&results).and_then(|()| envelope_bounds(&bounds));
    let envelope = combo_cert_3d("envelope", env.as_ref().map_err(|e| e.clone()), &dfactors, None);
    CertifiedMultiCase3D { results, cases, combinations, envelope }
}

fn envelope_aligned_3d(results: &MultiCaseResult3D) -> Result<(), String> {
    let Some(first) = results.combination_results.first() else {
        return Err("no combinations".into());
    };
    let nodes: Vec<usize> = first.results.displacements.iter().map(|d| d.node_id).collect();
    let elems: Vec<usize> = first.results.element_forces.iter().map(|f| f.element_id).collect();
    for c in &results.combination_results {
        if !c.results.displacements.iter().map(|d| d.node_id).eq(nodes.iter().copied())
            || !c.results.element_forces.iter().map(|f| f.element_id).eq(elems.iter().copied())
        {
            return Err("combination results are not aligned by id".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn case(name: &str, b: Result<f64, String>, u: [f64; 2], f: f64, fb: f64) -> CaseData<2, 1, 1, 1> {
        CaseData {
            name: name.into(),
            abs_bound: b,
            disp: [(1, u)].into_iter().collect(),
            forces: [(7, ([f], [f]))].into_iter().collect(),
            force_bounds: [(7, [fb])].into_iter().collect(),
            station_bounds: [(7, [2.0 * fb])].into_iter().collect(),
            reactions: [(1, [f])].into_iter().collect(),
            reaction_bounds: [(1, [3.0 * fb])].into_iter().collect(),
        }
    }

    fn no_dev(d: &[f64; 1], _l: f64) -> Vec<f64> {
        vec![d[0]]
    }

    type Disp = HashMap<usize, [f64; 2]>;
    type Forces = HashMap<usize, ([f64; 1], [f64; 1])>;

    fn run(
        factors: &[(usize, f64)], cases: &[CaseData<2, 1, 1, 1>], disp: &Disp, forces: &Forces, reaction: f64,
    ) -> Result<ComboBounds<1, 1, 1>, String> {
        let reactions = [(1, [reaction])].into_iter().collect();
        let lengths = [(7, 2.0)].into_iter().collect();
        certify_combo(factors, cases, &ComboData { disp, forces, reactions: &reactions, lengths: &lengths, station_dev: no_dev })
    }

    #[test]
    fn combo_bound_is_weighted_sum_plus_rounding() {
        let cases = vec![case("D", Ok(1e-6), [1.0, 2.0], 10.0, 0.5), case("L", Ok(2e-6), [0.1, 0.3], 4.0, 0.25)];
        let factors = [(0, 1.2), (1, 1.6)];
        let ux = 1.2 * 1.0 + 1.6 * 0.1;
        let uy = 1.2 * 2.0 + 1.6 * 0.3;
        let disp = [(1, [ux, uy])].into_iter().collect();
        let fc = 1.2 * 10.0 + 1.6 * 4.0;
        let forces = [(7, ([fc], [fc]))].into_iter().collect();
        let b = run(&factors, &cases, &disp, &forces, fc).unwrap();
        let expect = 1.2 * 1e-6 + 1.6 * 2e-6;
        assert!(b.disp >= expect && b.disp < expect * 1.0001, "{}", b.disp);
        let fexp = 1.2 * 0.5 + 1.6 * 0.25;
        assert!(b.forces[0].1[0] >= fexp && b.forces[0].1[0] < fexp * 1.0001);
        // Diagram and reaction bounds combine the cases' own bounds the same way.
        assert!(b.stations[0].1[0] >= 2.0 * fexp && b.stations[0].1[0] < 2.0 * fexp * 1.0001);
        assert!(b.reactions[0].1[0] >= 3.0 * fexp && b.reactions[0].1[0] < 3.0 * fexp * 1.0001);
    }

    #[test]
    fn misreported_combination_is_caught_by_rounding_term() {
        // A combination value that is wrong by 1e-3 must widen the bound by ≥ 1e-3.
        let cases = vec![case("D", Ok(1e-9), [1.0, 2.0], 10.0, 1e-9)];
        let disp = [(1, [1.5 + 1e-3, 3.0])].into_iter().collect();
        let forces = [(7, ([15.0 + 1e-3], [15.0]))].into_iter().collect();
        let b = run(&[(0, 1.5)], &cases, &disp, &forces, 15.0 + 2e-3).unwrap();
        assert!(b.disp >= 1e-3);
        assert!(b.forces[0].1[0] >= 1e-3);
        assert!(b.stations[0].1[0] >= 1e-3, "station bound carries the end-force rounding");
        assert!(b.reactions[0].1[0] >= 2e-3, "a misreported reaction widens its bound");
    }

    #[test]
    fn uncertified_case_poisons_combination_but_zero_factor_does_not() {
        let cases = vec![case("D", Ok(1e-9), [1.0, 2.0], 10.0, 1e-9), case("X", Err("mechanism".into()), [0.0, 0.0], 0.0, 0.0)];
        let disp = [(1, [1.0, 2.0])].into_iter().collect();
        let forces = [(7, ([10.0], [10.0]))].into_iter().collect();
        assert!(run(&[(0, 1.0), (1, 1.0)], &cases, &disp, &forces, 10.0).is_err());
        assert!(run(&[(0, 1.0), (1, 0.0)], &cases, &disp, &forces, 10.0).is_ok());
        assert!(run(&[(0, f64::NAN)], &cases, &disp, &forces, 10.0).is_err());
    }

    #[test]
    fn envelope_takes_max_and_requires_all() {
        let cb = |disp: f64, forces: Vec<(usize, [f64; 1])>| ComboBounds::<1, 1, 1> {
            disp, stations: forces.clone(), reactions: forces.clone(), forces,
        };
        let a = cb(1.0, vec![(1, [2.0]), (2, [1.0])]);
        let b = cb(3.0, vec![(1, [1.0])]);
        let e = envelope_bounds(&[Ok(a), Ok(b)]).unwrap();
        assert_eq!(e.disp, 3.0);
        assert_eq!(e.forces, vec![(1, [2.0])]); // element 2 not bounded by every combination
        assert_eq!(e.stations, vec![(1, [2.0])]);
        assert_eq!(e.reactions, vec![(1, [2.0])]);
        let c = cb(1.0, vec![]);
        assert!(envelope_bounds(&[Ok(c), Err("x".into())]).is_err());
    }

    /// Perturb every case's displacements by a vector of norm `b` (the case
    /// bound), recompute forces with the solver's own force routine, combine,
    /// and check the combined end forces and the diagram values at every
    /// station stay within the combination's certified bounds.
    #[test]
    fn force_and_station_bounds_cover_perturbed_cases() {
        use crate::postprocess::combinations::{combine_results_refs, CombinationFactor};
        use crate::postprocess::diagrams::{compute_diagram_value_at_sorted, sorted_point_loads};
        use crate::solver::dof::DofNumbering;
        use crate::solver::linear::{compute_internal_forces_2d_with_loads, solve_2d};

        let names = ["case1", "case2", "case3"];
        let inputs: Vec<SolverInput> = [
            include_str!("../../tests/fixtures/ex-building-3story-dlw-case1-input.json"),
            include_str!("../../tests/fixtures/ex-building-3story-dlw-case2-input.json"),
            include_str!("../../tests/fixtures/ex-building-3story-dlw-case3-input.json"),
        ]
        .iter()
        .map(|j| serde_json::from_str(j).unwrap())
        .collect();
        let structure = &inputs[0];
        let dof = DofNumbering::build_2d(structure);
        let b = 1e-4;
        let fb = force_bounds_2d(structure, b);
        let sb = super::super::stations::station_bounds_2d(structure, b);
        let res: Vec<AnalysisResults> = inputs.iter().map(|i| solve_2d(i).unwrap()).collect();
        let data: Vec<CaseData<3, 3, 3, 3>> = res
            .iter()
            .zip(names)
            .map(|(r, n)| {
                let (disp, forces) = index2(r);
                CaseData {
                    name: n.into(),
                    abs_bound: Ok(b),
                    disp,
                    forces,
                    force_bounds: fb.iter().map(|x| (x.element_id, fb2_arr(x))).collect(),
                    station_bounds: sb.iter().map(|x| (x.element_id, sb2_arr(x))).collect(),
                    reactions: HashMap::new(),
                    reaction_bounds: HashMap::new(),
                }
            })
            .collect();
        let factors = [(0usize, 1.2), (1, -1.0), (2, 1.6)];
        let cf: Vec<CombinationFactor> = factors.iter().map(|&(i, f)| CombinationFactor { case_id: i, factor: f }).collect();
        let refs: Vec<(usize, &AnalysisResults)> = res.iter().enumerate().collect();
        let combo = combine_results_refs(&cf, &refs).unwrap();
        let (cd, cfo) = index2(&combo);
        let lengths: HashMap<usize, f64> = combo.element_forces.iter().map(|f| (f.element_id, f.length)).collect();
        let no_reactions = HashMap::new();
        let cdata = ComboData { disp: &cd, forces: &cfo, reactions: &no_reactions, lengths: &lengths, station_dev: station_dev_2d };
        let bounds = certify_combo(&factors, &data, &cdata).unwrap();
        let cert = combo_cert_2d("c", Ok(&bounds), &HashMap::new(), Some(&combo.element_forces));
        let fbm: HashMap<usize, &ForceBound2D> = cert.force_bounds.iter().map(|f| (f.element_id, f)).collect();
        let sbm: HashMap<usize, &StationBound2D> = cert.station_bounds.iter().map(|f| (f.element_id, f)).collect();
        assert_eq!(fbm.len(), structure.elements.len());

        let mut worst = 0.0f64;
        for seed in 0..10usize {
            let perturbed: Vec<AnalysisResults> = inputs
                .iter()
                .zip(&res)
                .enumerate()
                .map(|(ci, (inp, r))| {
                    let mut u = super::super::solver::gather_u_2d(&dof, &r.displacements).unwrap();
                    let mut d: Vec<f64> = (0..dof.n_total)
                        .map(|i| if i < dof.n_free { (((i + 31 * seed + 7 * ci) * 7919) % 211) as f64 / 105.5 - 1.0 } else { 0.0 })
                        .collect();
                    let nrm = d.iter().map(|x| x * x).sum::<f64>().sqrt();
                    d.iter_mut().for_each(|x| *x *= b / nrm);
                    u.iter_mut().zip(&d).for_each(|(a, x)| *a += x);
                    let mut out = r.clone();
                    out.element_forces = compute_internal_forces_2d_with_loads(structure, &inp.loads, &dof, &u);
                    out
                })
                .collect();
            let prefs: Vec<(usize, &AnalysisResults)> = perturbed.iter().enumerate().collect();
            let pc = combine_results_refs(&cf, &prefs).unwrap();
            let pmap: HashMap<usize, &ElementForces> = pc.element_forces.iter().map(|f| (f.element_id, f)).collect();
            for a in &combo.element_forces {
                let p = pmap[&a.element_id];
                let f = fbm[&a.element_id];
                let s = sbm[&a.element_id];
                let slack = 1e-9 * (1.0 + a.m_start.abs() + a.v_start.abs() + a.n_start.abs());
                for (x, y, bnd) in [
                    (a.n_start, p.n_start, f.n), (a.n_end, p.n_end, f.n),
                    (a.v_start, p.v_start, f.v), (a.v_end, p.v_end, f.v),
                    (a.m_start, p.m_start, f.m), (a.m_end, p.m_end, f.m),
                ] {
                    assert!((x - y).abs() <= bnd + slack, "elem {}: {} vs {} bound {bnd}", a.element_id, x, y);
                    worst = worst.max((x - y).abs() / bnd);
                }
                let (sa, sp) = (sorted_point_loads(a), sorted_point_loads(p));
                for j in 0..=20 {
                    let t = j as f64 / 20.0;
                    for (kind, bnd) in [("moment", s.moment), ("shear", s.shear), ("axial", s.axial)] {
                        let va = compute_diagram_value_at_sorted(kind, t, a, &sa);
                        let vp = compute_diagram_value_at_sorted(kind, t, p, &sp);
                        assert!((va - vp).abs() <= bnd + slack, "elem {} {kind} t={t}: {va} vs {vp} bound {bnd}", a.element_id);
                    }
                }
            }
        }
        assert!(worst > 0.05, "bounds look vacuous: {worst}");
    }
}
