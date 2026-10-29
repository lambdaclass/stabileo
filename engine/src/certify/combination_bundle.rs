//! Load-combination certificate bundles: every load case as a linear-static
//! certificate over one shared reduced stiffness (Gram residual + Gershgorin, as in
//! `bundle.rs`), every combination's displacement bound, the displacement envelope,
//! and the combination/envelope bounds of the member end forces, re-checked by the
//! verified Lean checker `lake exe certcheck` (`verify/Certify/ComboCheck.lean`,
//! soundness `Certify.Combo.check_sound_disp` and `check_sound_quantities`). See
//! "Independent checking: certificate bundles" in `docs/verification/CERTIFY.md`.
//!
//! Displacements are checked end to end (the case bounds themselves are verified).
//! The per-case end-force bounds (`forces.rs`) are stated in the bundle and assumed by
//! the checker; it verifies that the combination and envelope bounds follow from them
//! and the factors (`B ≥ Σ|cᵢ| bᵢ + |Σ cᵢ vᵢ − v|`, `E ≥ B`).

use num_traits::{Signed, Zero};
use serde::{Deserialize, Serialize};

use super::bundle::{reason, to_dyadic, CscJson, Dyadic, KIND_LINEAR};
use super::combinations::{
    certify_multi_case_results_2d, certify_multi_case_results_3d, factor_list, fb2_arr, fb3_arr, forces2, forces3,
};
use super::exact::*;
use super::interval::Interval;
use super::linear::Certificate;
use super::plastic_3d::sqrt_up;
use super::provenance::Provenance;
use super::solver::{reduced_sparse_2d, reduced_sparse_3d};
use super::sparse::{certify_lambda_min_lower_with_factor, finish};
use crate::linalg::sparse::CscMatrix;
use crate::solver::load_cases::{solve_multi_case_2d, solve_multi_case_3d, MultiCaseInput, MultiCaseInput3D};

pub const COMBINATION_BUNDLE_FORMAT: &str = "stabileo.combination-certificate.v1";
pub const KIND_COMBINATION: &str = "load-combination";
pub const KIND_ENVELOPE: &str = "envelope";
pub const KIND_FORCE_COMBINATION: &str = "end-force-combination";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseJson {
    pub name: String,
    pub f_lo: Vec<Dyadic>,
    pub f_hi: Vec<Dyadic>,
    pub u: Vec<Dyadic>,
    pub bound: Dyadic,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComboJson {
    pub name: String,
    /// `(case index, factor)`.
    pub factors: Vec<(usize, Dyadic)>,
    pub u: Vec<Dyadic>,
    pub bound: Dyadic,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvelopeJson {
    /// `max_j |ũ_j[k]|` per free DOF (the engine's max-abs envelope).
    pub max_abs: Vec<Dyadic>,
    pub bound: Dyadic,
}

/// Scalar results with per-case bounds that the checker assumes (member end forces).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuantitiesJson {
    /// `e<id>.<start|end>.<component>` (display only).
    pub labels: Vec<String>,
    pub case_values: Vec<Vec<Dyadic>>,
    pub case_bounds: Vec<Vec<Dyadic>>,
    pub combo_values: Vec<Vec<Dyadic>>,
    pub combo_bounds: Vec<Vec<Dyadic>>,
    pub envelope_bounds: Vec<Dyadic>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombinationInfo {
    pub mu: f64,
    pub envelope_bound: f64,
    pub note: String,
}

/// A load-combination certificate bundle (JSON format
/// `stabileo.combination-certificate.v1`). `k`, `perm`, `l`, `mu` as in a linear
/// bundle; every number is an exact `[m, e]` dyadic.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombinationBundle {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub structured_diagnostics: Vec<crate::types::StructuredDiagnostic>,
    pub format: String,
    pub provenance: Provenance,
    pub dim: u8,
    pub n: usize,
    pub k: CscJson,
    pub perm: Vec<usize>,
    pub l: CscJson,
    pub mu: Dyadic,
    pub cases: Vec<CaseJson>,
    pub combos: Vec<ComboJson>,
    pub envelope: EnvelopeJson,
    pub quantities: QuantitiesJson,
    pub info: CombinationInfo,
}

impl CombinationBundle {
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).expect("bundle serializes")
    }

    pub fn from_json(s: &str) -> Result<Self, String> {
        serde_json::from_str(s).map_err(|e| format!("bundle parse error: {e}"))
    }
}

fn dyadics(xs: impl IntoIterator<Item = f64>) -> Result<Vec<Dyadic>, String> {
    xs.into_iter().map(to_dyadic).collect()
}

/// Per-quantity data: values per case, bounds per case, values per combination,
/// bounds per combination, envelope bounds, labels.
pub struct Quantities {
    pub labels: Vec<String>,
    pub case_values: Vec<Vec<f64>>,
    pub case_bounds: Vec<Vec<f64>>,
    pub combo_values: Vec<Vec<f64>>,
    pub combo_bounds: Vec<Vec<f64>>,
    pub envelope_bounds: Vec<f64>,
}

/// One combination: name, factors, reduced `ũ`.
pub type ComboData = (String, Vec<(usize, f64)>, Vec<f64>);

/// Certify the cases over the shared `K` and assemble the bundle.
#[allow(clippy::too_many_arguments)]
fn build(
    k: &CscMatrix,
    cases: &[(String, Vec<Interval>, Vec<f64>)],
    combos: &[ComboData],
    env_max_abs: &[f64],
    quantities: Quantities,
    provenance: Provenance,
    dim: u8,
) -> Result<CombinationBundle, String> {
    let n = k.n;
    if cases.is_empty() || combos.is_empty() {
        return Err("no load cases or no combinations".into());
    }
    let vals: Vec<Interval> = k.values.iter().map(|&x| Interval::point(x)).collect();
    let (mu, l) = certify_lambda_min_lower_with_factor(k, &vals)?;
    let mut case_json = Vec::with_capacity(cases.len());
    let mut bounds = Vec::with_capacity(cases.len());
    for (name, f, u) in cases {
        if f.len() != n || u.len() != n {
            return Err(format!("case '{name}': dimension mismatch"));
        }
        let Certificate::Certified { abs_bound, sigma, .. } = finish(k, f, u, mu) else {
            return Err(format!("case '{name}' not certified"));
        };
        bounds.push(q(abs_bound).ok_or("non-finite bound")?);
        case_json.push(CaseJson {
            name: name.clone(),
            f_lo: dyadics(f.iter().map(|x| x.lo))?,
            f_hi: dyadics(f.iter().map(|x| x.hi))?,
            u: dyadics(u.iter().copied())?,
            bound: to_dyadic(abs_bound)?,
        });
        debug_assert_eq!(sigma, mu);
    }
    // combination bounds, exactly: B = Σ|cᵢ| bᵢ + √(Σ_k (Σ cᵢ ũᵢ[k] − ũ_j[k])²), rounded up
    let mut combo_json = Vec::with_capacity(combos.len());
    let mut env_bound = 0.0f64;
    for (name, factors, uc) in combos {
        if uc.len() != n {
            return Err(format!("combination '{name}': dimension mismatch"));
        }
        let mut lin = Q::zero();
        for &(i, c) in factors {
            lin += q(c).ok_or("non-finite factor")?.abs() * &bounds[i];
        }
        let mut dev2 = Q::zero();
        for kk in 0..n {
            let mut s = -q(uc[kk]).ok_or("non-finite displacement")?;
            for &(i, c) in factors {
                s += q(c).unwrap() * q(cases[i].2[kk]).ok_or("non-finite displacement")?;
            }
            dev2 += &s * &s;
        }
        let b = to_f64_up(&(lin + sqrt_up(&dev2))).ok_or("combination bound out of range")?;
        env_bound = env_bound.max(b);
        combo_json.push(ComboJson {
            name: name.clone(),
            factors: factors.iter().map(|&(i, c)| Ok((i, to_dyadic(c)?))).collect::<Result<_, String>>()?,
            u: dyadics(uc.iter().copied())?,
            bound: to_dyadic(b)?,
        });
    }
    if env_max_abs.len() != n {
        return Err("envelope: dimension mismatch".into());
    }
    for (kk, &e) in env_max_abs.iter().enumerate() {
        let m = combos.iter().map(|c| c.2[kk].abs()).fold(0.0f64, f64::max);
        if e.abs() != m {
            return Err(format!("envelope value at free DOF {kk} is not the largest combination value"));
        }
    }
    let sym = &l.symbolic;
    let dd = |v: &Vec<Vec<f64>>| -> Result<Vec<Vec<Dyadic>>, String> { v.iter().map(|r| dyadics(r.iter().copied())).collect() };
    Ok(CombinationBundle {
        structured_diagnostics: crate::known_issues::sparse_conditioning(k).into_iter().collect(),
        format: COMBINATION_BUNDLE_FORMAT.into(),
        provenance,
        dim,
        n,
        k: CscJson { col_ptr: k.col_ptr.clone(), row_idx: k.row_idx.clone(), values: dyadics(k.values.iter().copied())? },
        perm: sym.perm.clone(),
        l: CscJson { col_ptr: sym.l_col_ptr.clone(), row_idx: sym.l_row_idx.clone(), values: dyadics(l.l_values.iter().copied())? },
        mu: to_dyadic(mu)?,
        cases: case_json,
        combos: combo_json,
        envelope: EnvelopeJson { max_abs: dyadics(env_max_abs.iter().map(|x| x.abs()))?, bound: to_dyadic(env_bound)? },
        quantities: QuantitiesJson {
            labels: quantities.labels,
            case_values: dd(&quantities.case_values)?,
            case_bounds: dd(&quantities.case_bounds)?,
            combo_values: dd(&quantities.combo_values)?,
            combo_bounds: dd(&quantities.combo_bounds)?,
            envelope_bounds: dyadics(quantities.envelope_bounds.iter().copied())?,
        },
        info: CombinationInfo {
            mu,
            envelope_bound: env_bound,
            note: "values are [m, e] = m·2^e exactly; end-force case bounds are assumed (forces.rs); check with `lake exe certcheck`".into(),
        },
    })
}

fn kinds() -> [&'static str; 4] {
    [KIND_LINEAR, KIND_COMBINATION, KIND_ENVELOPE, KIND_FORCE_COMBINATION]
}

/// Quantities: the end-force components of every member that the engine's envelope
/// certificate bounds (`K` components per end).
#[allow(clippy::too_many_arguments)]
fn end_force_quantities<const K: usize>(
    names: [&str; K],
    env_ids: &[usize],
    case_forces: &[std::collections::HashMap<usize, ([f64; K], [f64; K])>],
    case_bounds: &[std::collections::HashMap<usize, [f64; K]>],
    combo_forces: &[std::collections::HashMap<usize, ([f64; K], [f64; K])>],
    combo_bounds: &[std::collections::HashMap<usize, [f64; K]>],
    env_bounds: &std::collections::HashMap<usize, [f64; K]>,
) -> Result<Quantities, String> {
    let mut qn = Quantities {
        labels: vec![],
        case_values: vec![vec![]; case_forces.len()],
        case_bounds: vec![vec![]; case_forces.len()],
        combo_values: vec![vec![]; combo_forces.len()],
        combo_bounds: vec![vec![]; combo_forces.len()],
        envelope_bounds: vec![],
    };
    for &id in env_ids {
        for (end, end_name) in ["start", "end"].into_iter().enumerate() {
            for (k, comp) in names.iter().enumerate() {
                qn.labels.push(format!("e{id}.{end_name}.{comp}"));
                let pick = |f: &([f64; K], [f64; K])| if end == 0 { f.0[k] } else { f.1[k] };
                for (i, (cf, cb)) in case_forces.iter().zip(case_bounds).enumerate() {
                    qn.case_values[i].push(pick(cf.get(&id).ok_or("case without forces")?));
                    qn.case_bounds[i].push(cb.get(&id).ok_or("case without force bounds")?[k]);
                }
                for (j, (cf, cb)) in combo_forces.iter().zip(combo_bounds).enumerate() {
                    qn.combo_values[j].push(pick(cf.get(&id).ok_or("combination without forces")?));
                    qn.combo_bounds[j].push(cb.get(&id).ok_or("combination without force bounds")?[k]);
                }
                qn.envelope_bounds.push(env_bounds[&id][k]);
            }
        }
    }
    Ok(qn)
}

/// Solve and certify a 2D multi-case model and export its combination bundle.
pub fn export_combination_bundle_2d(input: &MultiCaseInput) -> Result<CombinationBundle, String> {
    super::finite::check_input(input)?;
    let results = solve_multi_case_2d(input)?;
    super::finite::check_results(&results)?;
    let cert = certify_multi_case_results_2d(input, results.clone());
    if !cert.envelope.certified {
        return Err(format!("envelope not certified: {}", cert.envelope.reason.unwrap_or_default()));
    }
    let reduced = |loads: &[crate::types::SolverLoad], r: &crate::types::AnalysisResults| {
        let mut ci = input.solver.clone();
        ci.loads = loads.to_vec();
        reduced_sparse_2d(&ci, r).map_err(reason)
    };
    let mut k0 = None;
    let mut cases = Vec::new();
    for (lc, cr) in input.load_cases.iter().zip(&results.case_results) {
        let (k, f, u) = reduced(&lc.loads, &cr.results)?;
        k0.get_or_insert(k);
        cases.push((lc.name.clone(), f, u));
    }
    let k = k0.ok_or("no load cases")?;
    let names: Vec<&str> = input.load_cases.iter().map(|c| c.name.as_str()).collect();
    let mut combos = Vec::new();
    for (def, cr) in input.combinations.iter().zip(&results.combination_results) {
        combos.push((def.name.clone(), factor_list(def, &names)?, reduced(&[], &cr.results)?.2));
    }
    let env = reduced(&[], &results.envelope.max_abs_results)?.2;
    let fmap = |r: &crate::types::AnalysisResults| r.element_forces.iter().map(|f| (f.element_id, forces2(f))).collect();
    let bmap = |b: &[super::forces::ForceBound2D]| b.iter().map(|b| (b.element_id, fb2_arr(b))).collect();
    let env_ids: Vec<usize> = cert.envelope.force_bounds.iter().map(|b| b.element_id).collect();
    let qn = end_force_quantities(
        ["N", "V", "M"],
        &env_ids,
        &results.case_results.iter().map(|c| fmap(&c.results)).collect::<Vec<_>>(),
        &cert.cases.iter().map(|c| bmap(&c.force_bounds)).collect::<Vec<_>>(),
        &results.combination_results.iter().map(|c| fmap(&c.results)).collect::<Vec<_>>(),
        &cert.combinations.iter().map(|c| bmap(&c.force_bounds)).collect::<Vec<_>>(),
        &bmap(&cert.envelope.force_bounds),
    )?;
    let prov = Provenance::new(input, "MultiCaseInput", &kinds())?;
    let mut bundle = build(&k, &cases, &combos, &env, qn, prov, 2)?;
    for result in results.case_results.iter().map(|c| &c.results)
        .chain(results.combination_results.iter().map(|c| &c.results))
        .chain(std::iter::once(&results.envelope.max_abs_results)) {
        crate::known_issues::attach(&mut bundle.structured_diagnostics, result.structured_diagnostics.clone());
    }
    super::finite::finite_output(Ok(bundle))
}

/// Solve and certify a 3D multi-case model and export its combination bundle.
pub fn export_combination_bundle_3d(input: &MultiCaseInput3D) -> Result<CombinationBundle, String> {
    super::finite::check_input(input)?;
    let results = solve_multi_case_3d(input)?;
    super::finite::check_results(&results)?;
    let cert = certify_multi_case_results_3d(input, results.clone());
    if !cert.envelope.certified {
        return Err(format!("envelope not certified: {}", cert.envelope.reason.unwrap_or_default()));
    }
    let reduced = |loads: &[crate::types::SolverLoad3D], r: &crate::types::AnalysisResults3D| {
        let mut ci = input.solver.clone();
        ci.loads = loads.to_vec();
        reduced_sparse_3d(&ci, r).map_err(reason)
    };
    let mut k0 = None;
    let mut cases = Vec::new();
    for (lc, cr) in input.load_cases.iter().zip(&results.case_results) {
        let (k, f, u) = reduced(&lc.loads, &cr.results)?;
        k0.get_or_insert(k);
        cases.push((lc.name.clone(), f, u));
    }
    let k = k0.ok_or("no load cases")?;
    let names: Vec<&str> = input.load_cases.iter().map(|c| c.name.as_str()).collect();
    let mut combos = Vec::new();
    for (def, cr) in input.combinations.iter().zip(&results.combination_results) {
        combos.push((def.name.clone(), factor_list(def, &names)?, reduced(&[], &cr.results)?.2));
    }
    let env = reduced(&[], &results.envelope.max_abs_results_3d)?.2;
    let fmap = |r: &crate::types::AnalysisResults3D| r.element_forces.iter().map(|f| (f.element_id, forces3(f))).collect();
    let bmap = |b: &[super::forces::ForceBound3D]| b.iter().map(|b| (b.element_id, fb3_arr(b))).collect();
    let env_ids: Vec<usize> = cert.envelope.force_bounds.iter().map(|b| b.element_id).collect();
    let qn = end_force_quantities(
        ["N", "Vy", "Vz", "T", "My", "Mz"],
        &env_ids,
        &results.case_results.iter().map(|c| fmap(&c.results)).collect::<Vec<_>>(),
        &cert.cases.iter().map(|c| bmap(&c.force_bounds)).collect::<Vec<_>>(),
        &results.combination_results.iter().map(|c| fmap(&c.results)).collect::<Vec<_>>(),
        &cert.combinations.iter().map(|c| bmap(&c.force_bounds)).collect::<Vec<_>>(),
        &bmap(&cert.envelope.force_bounds),
    )?;
    let prov = Provenance::new(input, "MultiCaseInput3D", &kinds())?;
    let mut bundle = build(&k, &cases, &combos, &env, qn, prov, 3)?;
    for result in results.case_results.iter().map(|c| &c.results)
        .chain(results.combination_results.iter().map(|c| &c.results))
        .chain(std::iter::once(&results.envelope.max_abs_results_3d)) {
        crate::known_issues::attach(&mut bundle.structured_diagnostics, result.structured_diagnostics.clone());
    }
    super::finite::finite_output(Ok(bundle))
}
