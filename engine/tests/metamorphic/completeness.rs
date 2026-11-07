use crate::ana2::{converged_finite, finite_2d, finite_3d, mat_e, rect, section_material};
use crate::ana3::{rect3, staged_3d, stage_all};
use crate::corpus::fuzz_models::{add_random_constraints_2d, add_random_constraints_3d, random_2d_model_rich, random_3d_model_rich};
use crate::linear_identities::building_3d;
use dedaliano_engine::load_session::{LoadSession2D, LoadSession3D};
use dedaliano_engine::solver::{
    cable, constraints, contact, corotational, fiber_nonlinear, linear, load_cases, material_nonlinear, modal, pdelta, ssi, staged, winkler,
};
use dedaliano_engine::types::*;
use std::collections::{BTreeMap, HashMap};

const SEEDS: std::ops::Range<u64> = 0..48;
const BUILDINGS: std::ops::Range<u64> = 0..20;

fn ids<T>(m: &HashMap<String, T>, id: impl Fn(&T) -> usize) -> Vec<usize> {
    m.values().map(id).collect()
}

pub(crate) fn same_ids(what: &str, expected: &[usize], got: impl IntoIterator<Item = usize>) -> Result<(), String> {
    let mut want: BTreeMap<usize, i64> = BTreeMap::new();
    for &e in expected {
        *want.entry(e).or_default() += 1;
    }
    let mut seen: BTreeMap<usize, i64> = BTreeMap::new();
    let mut n = 0;
    for g in got {
        *seen.entry(g).or_default() += 1;
        n += 1;
    }
    let mut problems = Vec::new();
    for (id, k) in &want {
        match seen.get(id).copied().unwrap_or(0) {
            0 => problems.push(format!("{id} missing")),
            c if c != *k => problems.push(format!("{id} reported {c} times, expected {k}")),
            _ => {}
        }
    }
    for (id, c) in &seen {
        if !want.contains_key(id) {
            problems.push(format!("{id} not in the model (reported {c} times)"));
        }
    }
    if problems.is_empty() && n == expected.len() {
        Ok(())
    } else {
        problems.truncate(8);
        Err(format!("{what}: {n} records for {} expected: {}", expected.len(), problems.join(", ")))
    }
}

fn support_nodes_2d(s: &SolverInput) -> Vec<usize> {
    let mut v: Vec<usize> = s.supports.values().map(|x| x.node_id).collect();
    v.sort_unstable();
    v.dedup();
    v
}

fn support_nodes_3d(s: &SolverInput3D) -> Vec<usize> {
    let mut v: Vec<usize> = s.supports.values().map(|x| x.node_id).collect();
    v.sort_unstable();
    v.dedup();
    v
}

pub(crate) fn displacements_2d(s: &SolverInput, d: &[Displacement]) -> Result<(), String> {
    same_ids("displacements", &ids(&s.nodes, |n| n.id), d.iter().map(|x| x.node_id))
}

pub(crate) fn displacements_3d(s: &SolverInput3D, d: &[Displacement3D]) -> Result<(), String> {
    same_ids("displacements", &ids(&s.nodes, |n| n.id), d.iter().map(|x| x.node_id))
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Known {
    None,
    SsiNoReactions,
}

impl Known {
    fn of(analysis: &str) -> Known {
        match analysis {
            "SSI" | "SSI (soil springs)" => Known::SsiNoReactions,
            _ => Known::None,
        }
    }
}

fn reactions<T>(known: Known, expected: &[usize], got: &[T], id: impl Fn(&T) -> usize) -> Result<(), String> {
    if known == Known::SsiNoReactions {
        return if got.is_empty() {
            Ok(())
        } else {
            Err(format!("known bug #1672 (SSI reports no reactions) no longer holds: {} reactions reported; switch SSI to the full reaction check", got.len()))
        };
    }
    same_ids("reactions", expected, got.iter().map(id))
}

pub(crate) fn check_2d(s: &SolverInput, r: &AnalysisResults, known: Known) -> Result<(), String> {
    displacements_2d(s, &r.displacements)?;
    reactions(known, &support_nodes_2d(s), &r.reactions, |x| x.node_id)?;
    same_ids("element forces", &ids(&s.elements, |e| e.id), r.element_forces.iter().map(|x| x.element_id))
}

pub(crate) fn check_3d(s: &SolverInput3D, r: &AnalysisResults3D, known: Known) -> Result<(), String> {
    let x = linear::expand_curved_beams_3d(s);
    displacements_3d(&x, &r.displacements)?;
    reactions(known, &support_nodes_3d(&x), &r.reactions, |x| x.node_id)?;
    same_ids("element forces", &ids(&x.elements, |e| e.id), r.element_forces.iter().map(|x| x.element_id))?;
    same_ids("plate stresses", &ids(&x.plates, |e| e.id), r.plate_stresses.iter().map(|x| x.element_id))?;
    let families = [
        ("MITC4 quad stresses", ids(&x.quads, |e| e.id)),
        ("MITC9 quad stresses", ids(&x.quad9s, |e| e.id)),
        ("solid shell stresses", ids(&x.solid_shells, |e| e.id)),
        ("curved shell stresses", ids(&x.curved_shells, |e| e.id)),
    ];
    let total: usize = families.iter().map(|f| f.1.len()).sum();
    if r.quad_stresses.len() != total {
        return Err(format!("quad stresses: {} records for {total} expected (MITC4, MITC9, solid and curved shells)", r.quad_stresses.len()));
    }
    let mut rest = r.quad_stresses.as_slice();
    for (what, expected) in &families {
        let (head, tail) = rest.split_at(expected.len());
        same_ids(what, expected, head.iter().map(|q| q.element_id))?;
        rest = tail;
    }
    Ok(())
}

fn in_key_order<T>(m: &HashMap<String, T>) -> Vec<&T> {
    let mut v: Vec<(&String, &T)> = m.iter().collect();
    v.sort_by(|a, b| a.0.cmp(b.0));
    v.into_iter().map(|x| x.1).collect()
}

pub(crate) fn nodal_stresses_3d(s: &SolverInput3D, r: &AnalysisResults3D) -> Result<(), String> {
    let mut expected: Vec<(usize, usize)> = in_key_order(&s.quads).into_iter().flat_map(|q| q.nodes.map(|n| (q.id, n))).collect();
    expected.extend(in_key_order(&s.quad9s).into_iter().flat_map(|q| q.nodes.map(|n| (q.id, n))));
    if r.quad_nodal_stresses.len() != expected.len() {
        return Err(format!("quad nodal stresses: {} records for {} expected", r.quad_nodal_stresses.len(), expected.len()));
    }
    match expected.iter().zip(&r.quad_nodal_stresses).position(|((_, n), got)| *n != got.node_index) {
        None => Ok(()),
        Some(k) => Err(format!("quad nodal stresses: record {k} is node {}, expected node {} of shell {}", r.quad_nodal_stresses[k].node_index, expected[k].1, expected[k].0)),
    }
}

type Out2 = Result<Vec<(String, AnalysisResults)>, String>;
type Out3 = Result<Vec<(String, AnalysisResults3D)>, String>;

fn one<T>(r: Result<T, String>) -> Result<Vec<(String, T)>, String> {
    r.map(|r| vec![(String::new(), r)])
}

fn split_cases<T: Clone>(loads: &[T]) -> [Vec<T>; 2] {
    [loads.iter().step_by(2).cloned().collect(), loads.iter().skip(1).step_by(2).cloned().collect()]
}

fn combination() -> Vec<load_cases::CombinationDef> {
    vec![load_cases::CombinationDef { name: "C".into(), factors: [("A".to_string(), 1.2), ("B".to_string(), 1.6)].into() }]
}

fn multi_case_2d(s: &SolverInput) -> Out2 {
    let [a, b] = split_cases(&s.loads);
    let r = load_cases::solve_multi_case_2d(&load_cases::MultiCaseInput {
        solver: SolverInput { loads: vec![], ..s.clone() },
        load_cases: vec![load_cases::LoadCase { name: "A".into(), loads: a }, load_cases::LoadCase { name: "B".into(), loads: b }],
        combinations: combination(),
    })?;
    Ok(r.case_results.into_iter().map(|c| (format!("case {}", c.name), c.results)).chain(r.combination_results.into_iter().map(|c| (format!("combination {}", c.name), c.results))).collect())
}

fn multi_case_3d(s: &SolverInput3D) -> Out3 {
    let [a, b] = split_cases(&s.loads);
    let r = load_cases::solve_multi_case_3d(&load_cases::MultiCaseInput3D {
        solver: SolverInput3D { loads: vec![], ..s.clone() },
        load_cases: vec![load_cases::LoadCase3D { name: "A".into(), loads: a }, load_cases::LoadCase3D { name: "B".into(), loads: b }],
        combinations: combination(),
    })?;
    Ok(r.case_results.into_iter().map(|c| (format!("case {}", c.name), c.results)).chain(r.combination_results.into_iter().map(|c| (format!("combination {}", c.name), c.results))).collect())
}

fn staged_2d(s: &SolverInput) -> Out2 {
    let st = crate::ana2::stage("all", s, (0..s.loads.len()).collect(), true);
    let r = staged::solve_staged_2d(&crate::ana2::staged_input(s, vec![st])?)?;
    Ok(r.stages.into_iter().map(|x| (format!("stage {}", x.stage_name), x.results)).chain([("final".to_string(), r.final_results)]).collect())
}

fn staged_3d_all(s: &SolverInput3D) -> Out3 {
    let r = staged_3d(s, serde_json::json!([stage_all(s, (0..s.loads.len()).collect())]))?;
    Ok(r.stages.into_iter().map(|x| (format!("stage {}", x.stage_name), x.results)).chain([("final".to_string(), r.final_results)]).collect())
}

fn material_2d(s: &SolverInput) -> Out2 {
    let fy = 250.0e3;
    let inp = NonlinearMaterialInput {
        solver: s.clone(),
        material_models: s.materials.values().map(|x| (x.id.to_string(), MaterialModel { model_type: "elastic_perfectly_plastic".into(), fy: 250.0, alpha: None })).collect(),
        section_capacities: s.sections.values().map(|x| {
            let (b, h) = rect(x.a, x.iz);
            (x.id.to_string(), SectionCapacity { np: fy * x.a, mp: fy * b * h * h / 4.0, zp: None })
        }).collect(),
        max_iter: 60,
        tolerance: 1e-10,
        n_increments: 4,
    };
    one(material_nonlinear::solve_nonlinear_material_2d(&inp).map(|r| r.results))
}

fn material_3d(s: &SolverInput3D) -> Out3 {
    let fy = 250.0e3;
    let inp = NonlinearMaterialInput3D {
        solver: s.clone(),
        material_models: s.materials.values().map(|x| (x.id.to_string(), MaterialModel { model_type: "elastic_perfectly_plastic".into(), fy: 250.0, alpha: None })).collect(),
        section_capacities: s.sections.values().map(|x| {
            let (b, h) = rect3(x);
            (x.id.to_string(), SectionCapacity3D { np: fy * x.a, mpy: fy * h * b * b / 4.0, mpz: fy * b * h * h / 4.0, mpx: Some(fy * x.j / b.min(h)) })
        }).collect(),
        max_iter: 60,
        tolerance: 1e-10,
        n_increments: 4,
    };
    one(material_nonlinear::solve_nonlinear_material_3d(&inp).map(|r| r.results))
}

fn fiber_2d(s: &SolverInput) -> Out2 {
    let sections = s.sections.values().map(|x| {
        let (b, h) = rect(x.a, x.iz);
        (x.id.to_string(), crate::ana2::rect_fibers(b, h, 40, 1, mat_e(s, x.id)))
    }).collect();
    let inp = fiber_nonlinear::FiberNonlinearInput { solver: s.clone(), fiber_sections: sections, n_integration_points: 5, max_iter: 60, tolerance: 1e-10, n_increments: 2, modified_nr: false };
    one(fiber_nonlinear::solve_fiber_nonlinear_2d(&inp).map(|r| r.results))
}

fn fiber_3d(s: &SolverInput3D) -> Out3 {
    let sections = s.sections.values().map(|x| {
        let (b, h) = rect3(x);
        let e = section_material(&s.materials, s.elements.values().filter(|e| e.section_id == x.id).map(|e| e.material_id)).map_or(200_000.0, |m| m.e);
        (x.id.to_string(), crate::ana3::rect_fibers(b, h, 12, 12, e))
    }).collect();
    let inp = fiber_nonlinear::FiberNonlinearInput3D { solver: s.clone(), fiber_sections: sections, n_integration_points: 5, max_iter: 60, tolerance: 1e-10, n_increments: 2, modified_nr: false };
    one(fiber_nonlinear::solve_fiber_nonlinear_3d(&inp).map(|r| r.results))
}

fn modal_2d(s: &SolverInput, dens: &HashMap<String, f64>) -> Result<Vec<Vec<Displacement>>, String> {
    Ok(modal::solve_modal_2d(s, dens, MODES)?.modes.into_iter().map(|m| m.displacements).collect())
}

fn modal_3d(s: &SolverInput3D, dens: &HashMap<String, f64>) -> Result<Vec<Vec<Displacement3D>>, String> {
    Ok(modal::solve_modal_3d(s, dens, MODES)?.modes.into_iter().map(|m| m.displacements).collect())
}

type Ana2 = (&'static str, fn(&SolverInput, &HashMap<String, f64>) -> Out2);
type Ana3 = (&'static str, fn(&SolverInput3D, &HashMap<String, f64>) -> Out3);

fn analyses_2d() -> Vec<Ana2> {
    vec![
        ("linear", |s, _| one(linear::solve_2d(s))),
        ("linear (load session)", |s, _| one(LoadSession2D::from_input(s.clone())?.solve_loads(&s.loads))),
        ("constrained", |s, _| one(constraints::solve_constrained_2d(&constraints::ConstrainedInput { solver: s.clone(), constraints: s.constraints.clone() }))),
        ("certified linear", |s, _| one(dedaliano_engine::certify::certify_linear_2d_full(s).map(|r| r.results))),
        ("load combinations", |s, _| multi_case_2d(s)),
        ("staged", |s, _| staged_2d(s)),
        ("Winkler", |s, _| one(winkler::solve_winkler_2d(&winkler::WinklerInput { solver: s.clone(), foundation_springs: vec![] }))),
        ("contact", |s, _| {
            let inp: contact::ContactInput = serde_json::from_value(serde_json::json!({ "solver": s })).map_err(|e| e.to_string())?;
            one(contact::solve_contact_2d(&inp).map(|r| r.results))
        }),
        ("SSI", |s, _| one(ssi::solve_ssi_2d(&ssi::SSIInput { solver: s.clone(), soil_springs: vec![], max_iter: 50, tolerance: 1e-10 }).map(|r| r.results))),
        ("P-Delta", |s, _| one(converged_finite(pdelta::solve_pdelta_2d(s, 100, 1e-12).map(|r| (r.converged, r.results)), finite_2d))),
        ("corotational", |s, _| one(corotational::solve_corotational_2d(s, 100, 1e-10, 4, false).map(|r| r.results))),
        ("material nonlinear", |s, _| material_2d(s)),
        ("fiber nonlinear", |s, _| fiber_2d(s)),
        ("cable", |s, d| one(cable::solve_cable_2d(s, d, 100, 1e-10).map(|r| r.results))),
    ]
}

fn soil_springs(s: &SolverInput3D) -> Vec<ssi::SoilSpring> {
    let supported: std::collections::HashSet<usize> = s.supports.values().map(|x| x.node_id).collect();
    let mut nodes: Vec<usize> = s.nodes.values().map(|n| n.id).filter(|n| !supported.contains(n)).collect();
    nodes.sort_unstable();
    nodes.into_iter().take(6).map(|node_id| ssi::SoilSpring { node_id, direction: 2, curve: dedaliano_engine::solver::soil_curves::SoilCurve::Tz { t_ult: 50.0, z_ult: 0.01, perimeter: Some(1.0) }, tributary_length: 1.0 }).collect()
}

fn analyses_3d() -> Vec<Ana3> {
    vec![
        ("linear", |s, _| one(linear::solve_3d(s))),
        ("linear (load session)", |s, _| one(LoadSession3D::from_input(s.clone())?.solve_loads(&s.loads))),
        ("constrained", |s, _| one(constraints::solve_constrained_3d(&constraints::ConstrainedInput3D { solver: s.clone(), constraints: s.constraints.clone() }))),
        ("certified linear", |s, _| one(dedaliano_engine::certify::certify_linear_3d_full(s).map(|r| r.results))),
        ("load combinations", |s, _| multi_case_3d(s)),
        ("staged", |s, _| staged_3d_all(s)),
        ("Winkler", |s, _| one(winkler::solve_winkler_3d(&winkler::WinklerInput3D { solver: s.clone(), foundation_springs: vec![] }))),
        ("contact", |s, _| {
            let inp: contact::ContactInput3D = serde_json::from_value(serde_json::json!({ "solver": s })).map_err(|e| e.to_string())?;
            one(contact::solve_contact_3d(&inp).map(|r| r.results))
        }),
        ("SSI", |s, _| one(ssi::solve_ssi_3d(&ssi::SSIInput3D { solver: s.clone(), soil_springs: vec![], max_iter: 50, tolerance: 1e-10 }).map(|r| r.results))),
        ("Winkler (springs)", |s, _| one(winkler::solve_winkler_3d(&winkler::WinklerInput3D { solver: s.clone(), foundation_springs: s.elements.values().filter(|e| ![e.release_my_start, e.release_my_end, e.release_mz_start, e.release_mz_end, e.release_t_start, e.release_t_end].contains(&true)).map(|e| winkler::FoundationSpring3D { element_id: e.id, ky: Some(2e3), kz: Some(5e3) }).collect() }))),
        ("SSI (soil springs)", |s, _| one(ssi::solve_ssi_3d(&ssi::SSIInput3D { solver: s.clone(), soil_springs: soil_springs(s), max_iter: 200, tolerance: 1e-8 }).map(|r| r.results))),
        ("P-Delta", |s, _| one(converged_finite(pdelta::solve_pdelta_3d(s, 100, 1e-12).map(|r| (r.converged, r.results)), finite_3d))),
        ("corotational", |s, _| one(corotational::solve_corotational_3d(s, 100, 1e-10, 4, false).map(|r| r.results))),
        ("material nonlinear", |s, _| material_3d(s)),
        ("fiber nonlinear", |s, _| fiber_3d(s)),
        ("cable", |s, d| one(cable::solve_cable_3d(s, d, 100, 1e-10).map(|r| r.results))),
    ]
}

fn models_2d() -> impl Iterator<Item = (String, SolverInput, HashMap<String, f64>)> {
    SEEDS.map(|seed| {
        let (mut s, dens) = random_2d_model_rich(seed);
        if seed % 2 == 1 {
            add_random_constraints_2d(&mut s, seed);
        }
        (format!("fuzz_rich_2d/{seed}"), s, dens)
    })
}

fn models_3d() -> impl Iterator<Item = (String, SolverInput3D, HashMap<String, f64>)> {
    let buildings = BUILDINGS.map(|seed| (format!("building_3d/{seed}"), building_3d(seed), HashMap::from([("1".to_string(), 7.85), ("2".to_string(), 2.5)])));
    let fuzz = SEEDS.map(|seed| {
        let (mut s, dens) = random_3d_model_rich(seed);
        if seed % 2 == 1 {
            add_random_constraints_3d(&mut s, seed);
        }
        (format!("fuzz_rich_3d/{seed}"), s, dens)
    });
    let frames = BUILDINGS.filter(|seed| matches!(seed % 5, 0 | 1 | 4)).map(|seed| (format!("frame_3d/{seed}"), frame_only(building_3d(seed)), HashMap::from([("1".to_string(), 7.85)])));
    buildings.chain(frames).chain(fuzz)
}

fn frame_only(s: SolverInput3D) -> SolverInput3D {
    let mut v = serde_json::to_value(&s).unwrap();
    for family in ["plates", "quads", "quad9s", "solidShells", "curvedShells"] {
        v[family] = serde_json::json!({});
    }
    let dropped = ["pressure", "quadPressure", "quadThermal", "quad9Pressure", "solidShellPressure", "curvedShellPressure", "thermal"];
    v["loads"].as_array_mut().unwrap().retain(|l| !dropped.contains(&l["type"].as_str().unwrap_or("")));
    for sp in v["supports"].as_object_mut().unwrap().values_mut() {
        sp.as_object_mut().unwrap().remove("dz");
    }
    let s: SolverInput3D = serde_json::from_value(v).unwrap();
    assert!(s.plates.is_empty() && s.quads.is_empty() && s.curved_shells.is_empty() && !s.loads.is_empty());
    s
}

fn has_shells(s: &SolverInput3D) -> bool {
    !(s.plates.is_empty() && s.quads.is_empty() && s.quad9s.is_empty() && s.solid_shells.is_empty() && s.curved_shells.is_empty())
}

fn has_releases(s: &SolverInput3D) -> bool {
    s.elements.values().any(|e| [e.release_my_start, e.release_my_end, e.release_mz_start, e.release_mz_end, e.release_t_start, e.release_t_end].contains(&true))
}

fn has_settlements(s: &SolverInput3D) -> bool {
    s.supports.values().any(|x| [x.dx, x.dy, x.dz, x.drx, x.dry, x.drz].iter().any(Option::is_some))
}

type Applies = fn(&SolverInput3D) -> bool;

const DECLARED_REFUSALS: &[(&str, &str, Applies)] = &[
    ("corotational", "does not support shell elements", has_shells),
    ("material nonlinear", "does not support shell elements", has_shells),
    ("fiber nonlinear", "does not support shell elements", has_shells),
    ("fiber nonlinear", "does not support member end releases", has_releases),
    ("fiber nonlinear", "does not support prescribed support displacements", has_settlements),
    ("SSI", "does not support prescribed support displacements", has_settlements),
    ("SSI (soil springs)", "does not support prescribed support displacements", has_settlements),
    ("staged", "Nine-node shell elements are not yet supported in staged construction", |s| !s.quad9s.is_empty()),
    ("staged", "does not support curved shell elements", |s| !s.curved_shells.is_empty()),
    ("staged", "does not support solid shell elements", |s| !s.solid_shells.is_empty()),
];

fn declared_refusal(analysis: &str, error: &str, s: &SolverInput3D) -> bool {
    DECLARED_REFUSALS.iter().any(|(a, phrase, applies)| *a == analysis && error.contains(phrase) && applies(s))
}

type Checks = Result<Vec<Result<(), String>>, String>;

fn gate(analysis: &str, model: &str, s: &SolverInput3D, r: Checks) -> Checks {
    match r {
        Err(e) if !model.starts_with("fuzz") && !declared_refusal(analysis, &e, s) => Ok(vec![Err(format!("refused a deterministic model: {e}"))]),
        r => r,
    }
}

fn mode_count(model: &str, n: usize) -> Result<(), String> {
    let wanted = if model.starts_with("fuzz") { 1..=MODES } else { MODES..=MODES };
    if wanted.contains(&n) { Ok(()) } else { Err(format!("{n} modes, expected {wanted:?}")) }
}

const MODES: usize = 4;

#[derive(Default)]
struct Ledger {
    checked: BTreeMap<String, usize>,
    refused: BTreeMap<String, usize>,
    reasons: BTreeMap<String, String>,
    violations: Vec<String>,
}

impl Ledger {
    fn record(&mut self, analysis: &str, model: &str, tags: &[&str], results: Checks) {
        match results {
            Err(e) => {
                *self.refused.entry(analysis.to_string()).or_default() += 1;
                self.reasons.entry(analysis.to_string()).or_insert_with(|| format!("{model}: {}", e.chars().take(200).collect::<String>()));
            }
            Ok(checks) => {
                for c in checks {
                    match c {
                        Ok(()) => {
                            *self.checked.entry(analysis.to_string()).or_default() += 1;
                            for t in tags {
                                *self.checked.entry(format!("{analysis} / {t}")).or_default() += 1;
                            }
                        }
                        Err(e) => self.violations.push(format!("{analysis} on {model}: {e}")),
                    }
                }
            }
        }
    }

    fn finish(self, what: &str, required: &[String]) {
        println!("{what}: checked {:?}\nrefused {:?}\nfirst refusals {:#?}", self.checked, self.refused, self.reasons);
        assert!(self.violations.is_empty(), "{what}: {} incomplete result(s):\n{}", self.violations.len(), self.violations.join("\n"));
        for k in required {
            assert!(self.checked.get(k).copied().unwrap_or(0) > 0, "{what}: nothing checked for {k}: {:?}", self.checked);
        }
    }
}

fn shell_tags(s: &SolverInput3D) -> Vec<&'static str> {
    [(!s.plates.is_empty(), "plates"), (!s.quads.is_empty(), "MITC4"), (!s.quad9s.is_empty(), "MITC9"), (!s.solid_shells.is_empty(), "solid shells"), (!s.curved_shells.is_empty(), "curved shells")]
        .into_iter()
        .filter_map(|(p, n)| p.then_some(n))
        .collect()
}

fn outputs(analysis: &str) -> &'static [&'static str] {
    match analysis {
        "load combinations" => &["case A", "case B", "combination C"],
        "staged" => &["stage all", "final"],
        _ => &[""],
    }
}

pub(crate) fn outputs_complete<T>(analysis: &str, got: &[(String, T)]) -> Result<(), String> {
    let labels: Vec<&str> = got.iter().map(|(l, _)| l.as_str()).collect();
    if labels == outputs(analysis) {
        Ok(())
    } else {
        Err(format!("outputs {labels:?}, expected {:?}", outputs(analysis)))
    }
}

#[test]
fn every_node_support_and_element_has_one_record_2d() {
    let mut ledger = Ledger::default();
    for (name, s, dens) in models_2d() {
        for (analysis, run) in analyses_2d() {
            let r = run(&s, &dens).map(|v| std::iter::once(outputs_complete(analysis, &v)).chain(v.iter().map(|(label, r)| check_2d(&s, r, Known::of(analysis)).map_err(|e| format!("{label} {e}")))).collect());
            ledger.record(analysis, &name, &[], r);
        }
        let modes = modal_2d(&s, &dens).map(|m| std::iter::once(mode_count(&name, m.len())).chain(m.iter().enumerate().map(|(k, d)| displacements_2d(&s, d).map_err(|e| format!("mode {k} {e}")))).collect());
        ledger.record("modal", &name, &[], modes);
    }
    let mut required: Vec<String> = analyses_2d().iter().map(|a| a.0.to_string()).collect();
    required.push("modal".into());
    ledger.finish("completeness 2D", &required);
}

#[test]
fn every_node_support_element_and_shell_has_one_record_3d() {
    let mut ledger = Ledger::default();
    for (name, s, dens) in models_3d() {
        let tags = shell_tags(&s);
        for (analysis, run) in analyses_3d() {
            let r = run(&s, &dens).map(|v| std::iter::once(outputs_complete(analysis, &v)).chain(v.iter().map(|(label, r)| check_3d(&s, r, Known::of(analysis)).map_err(|e| format!("{label} {e}")))).collect());
            ledger.record(analysis, &name, &tags, gate(analysis, &name, &s, r));
        }
        let nodal = linear::solve_3d(&s).map(|r| vec![nodal_stresses_3d(&s, &r)]);
        let nodal_tags: Vec<&str> = tags.iter().copied().filter(|t| matches!(*t, "MITC4" | "MITC9")).collect();
        ledger.record("linear nodal stresses", &name, &nodal_tags, gate("linear", &name, &s, nodal));
        let modes = modal_3d(&s, &dens).map(|m| std::iter::once(mode_count(&name, m.len())).chain(m.iter().enumerate().map(|(k, d)| displacements_3d(&s, d).map_err(|e| format!("mode {k} {e}")))).collect());
        ledger.record("modal", &name, &tags, gate("modal", &name, &s, modes));
    }
    let mut required: Vec<String> = analyses_3d().iter().map(|a| a.0.to_string()).collect();
    required.extend(["modal", "linear nodal stresses"].map(String::from));
    for family in ["plates", "MITC4", "MITC9", "solid shells", "curved shells"] {
        required.push(format!("linear / {family}"));
    }
    for family in ["MITC4", "MITC9"] {
        required.push(format!("linear nodal stresses / {family}"));
    }
    ledger.finish("completeness 3D", &required);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn removed<T: Clone>(v: &[T], k: usize) -> Vec<T> {
        let mut v = v.to_vec();
        v.remove(k);
        v
    }

    fn duplicated<T: Clone>(v: &[T], k: usize) -> Vec<T> {
        let mut v = v.to_vec();
        v.push(v[k].clone());
        v
    }

    fn swapped<T: Clone>(v: &[T], k: usize, other: T) -> Vec<T> {
        let mut v = v.to_vec();
        v[k] = other;
        v
    }

    fn rejects_3d(s: &SolverInput3D, r: &AnalysisResults3D, edit: impl Fn(&mut AnalysisResults3D)) {
        let mut bad = r.clone();
        edit(&mut bad);
        assert!(check_3d(s, &bad, Known::None).is_err(), "an edited result passed");
    }

    #[test]
    fn a_missing_or_duplicated_record_fails_3d() {
        for seed in 0..5 {
            let s = building_3d(seed);
            let r = linear::solve_3d(&s).unwrap();
            check_3d(&s, &r, Known::None).unwrap();
            nodal_stresses_3d(&s, &r).unwrap();
            let last = r.displacements.len() - 1;
            rejects_3d(&s, &r, |b| b.displacements = removed(&b.displacements, last));
            rejects_3d(&s, &r, |b| b.displacements = duplicated(&b.displacements, 0));
            rejects_3d(&s, &r, |b| b.reactions = removed(&b.reactions, 0));
            rejects_3d(&s, &r, |b| b.reactions = duplicated(&b.reactions, 0));
            rejects_3d(&s, &r, |b| b.element_forces = removed(&b.element_forces, 3));
            rejects_3d(&s, &r, |b| b.element_forces = duplicated(&b.element_forces, 3));
            rejects_3d(&s, &r, |b| b.element_forces = swapped(&b.element_forces, 0, b.element_forces[1].clone()));
            if !r.plate_stresses.is_empty() {
                rejects_3d(&s, &r, |b| b.plate_stresses = removed(&b.plate_stresses, 0));
                rejects_3d(&s, &r, |b| b.plate_stresses = duplicated(&b.plate_stresses, 0));
            }
            if !r.quad_stresses.is_empty() {
                rejects_3d(&s, &r, |b| b.quad_stresses = removed(&b.quad_stresses, 0));
                rejects_3d(&s, &r, |b| b.quad_stresses = duplicated(&b.quad_stresses, 0));
                rejects_3d(&s, &r, |b| b.quad_stresses = swapped(&b.quad_stresses, 0, b.quad_stresses[1].clone()));
            }
            if !r.quad_nodal_stresses.is_empty() {
                let mut bad = r.clone();
                bad.quad_nodal_stresses = removed(&bad.quad_nodal_stresses, 0);
                assert!(nodal_stresses_3d(&s, &bad).is_err());
                bad.quad_nodal_stresses = duplicated(&r.quad_nodal_stresses, 0);
                assert!(nodal_stresses_3d(&s, &bad).is_err());
            }
        }
    }

    #[test]
    fn a_shell_reported_under_another_family_fails() {
        let mut s = building_3d(1);
        let quad = s.quads["4"].clone();
        s.quads.remove("4");
        s.curved_shells.insert("7".into(), SolverCurvedShellElement { id: 7, nodes: quad.nodes, material_id: quad.material_id, thickness: quad.thickness, normals: None });
        let r = linear::solve_3d(&SolverInput3D { loads: vec![], ..s.clone() }).unwrap();
        check_3d(&s, &r, Known::None).unwrap();
        let mut relabelled = r.clone();
        relabelled.quad_stresses[3].element_id = 1;
        assert!(check_3d(&s, &relabelled, Known::None).is_err());
        let mut reordered = r.clone();
        reordered.quad_stresses.swap(0, 3);
        assert!(check_3d(&s, &reordered, Known::None).is_err());
    }

    #[test]
    fn a_missing_or_duplicated_record_fails_2d() {
        let (name, s, _) = models_2d().find(|(_, s, _)| linear::solve_2d(s).is_ok() && s.elements.len() > 1 && !s.supports.is_empty()).unwrap();
        let r = linear::solve_2d(&s).unwrap();
        check_2d(&s, &r, Known::None).unwrap();
        let edits: [fn(&mut AnalysisResults); 6] = [
            |b| b.displacements = removed(&b.displacements, 0),
            |b| b.displacements = duplicated(&b.displacements, 0),
            |b| b.reactions = removed(&b.reactions, 0),
            |b| b.reactions = duplicated(&b.reactions, 0),
            |b| b.element_forces = removed(&b.element_forces, 0),
            |b| b.element_forces = duplicated(&b.element_forces, 0),
        ];
        for edit in edits {
            let mut bad = r.clone();
            edit(&mut bad);
            assert!(check_2d(&s, &bad, Known::None).is_err(), "{name}: an edited result passed");
        }
    }

    #[test]
    fn modal_shapes_need_every_node() {
        let s = building_3d(1);
        let modes = modal_3d(&s, &HashMap::from([("1".to_string(), 7.85), ("2".to_string(), 2.5)])).unwrap();
        assert!(!modes.is_empty());
        for d in &modes {
            displacements_3d(&s, d).unwrap();
            assert!(displacements_3d(&s, &removed(d, 0)).is_err());
            assert!(displacements_3d(&s, &duplicated(d, 0)).is_err());
        }
    }

    #[test]
    fn known_bug_holds_exactly_and_everything_else_stays_checked() {
        for seed in [0, 1] {
            let s = building_3d(seed);
            let r = linear::solve_3d(&s).unwrap();
            let mut ssi = r.clone();
            ssi.reactions.clear();
            check_3d(&s, &ssi, Known::SsiNoReactions).unwrap();
            assert!(check_3d(&s, &ssi, Known::None).is_err());
            assert!(check_3d(&s, &r, Known::SsiNoReactions).unwrap_err().contains("#1672"));
            let mut shellless = r.clone();
            (shellless.plate_stresses, shellless.quad_stresses, shellless.quad_nodal_stresses) = (vec![], vec![], vec![]);
            assert!(check_3d(&s, &shellless, Known::None).is_err());
            let edits: [fn(&mut AnalysisResults3D); 4] = [
                |b| b.displacements = removed(&b.displacements, 0),
                |b| b.displacements = duplicated(&b.displacements, 0),
                |b| b.element_forces = removed(&b.element_forces, 0),
                |b| b.element_forces = duplicated(&b.element_forces, 0),
            ];
            for edit in edits {
                let mut bad = ssi.clone();
                edit(&mut bad);
                assert!(check_3d(&s, &bad, Known::SsiNoReactions).is_err(), "an edited SSI result passed");
            }
            let mut ssi_shells = ssi.clone();
            ssi_shells.plate_stresses.clear();
            ssi_shells.quad_stresses.clear();
            assert!(check_3d(&s, &ssi_shells, Known::SsiNoReactions).is_err());
        }
    }

    #[test]
    fn known_ssi_bug_2d_holds_exactly() {
        let (_, s, _) = models_2d().find(|(_, s, _)| linear::solve_2d(s).is_ok() && !s.supports.is_empty()).unwrap();
        let r = linear::solve_2d(&s).unwrap();
        assert!(check_2d(&s, &r, Known::SsiNoReactions).unwrap_err().contains("#1672"));
        let mut ssi = r.clone();
        ssi.reactions.clear();
        check_2d(&s, &ssi, Known::SsiNoReactions).unwrap();
        assert!(check_2d(&s, &ssi, Known::None).is_err());
        ssi.element_forces = removed(&ssi.element_forces, 0);
        assert!(check_2d(&s, &ssi, Known::SsiNoReactions).is_err());
    }

    #[test]
    fn a_missing_case_combination_or_stage_fails() {
        let s = building_3d(1);
        let combos = multi_case_3d(&s).unwrap();
        outputs_complete("load combinations", &combos).unwrap();
        for k in 0..combos.len() {
            assert!(outputs_complete("load combinations", &removed(&combos, k)).is_err());
        }
        assert!(outputs_complete("load combinations", &duplicated(&combos, 0)).is_err());
        let stages = staged_3d_all(&s).unwrap();
        outputs_complete("staged", &stages).unwrap();
        for k in 0..stages.len() {
            assert!(outputs_complete("staged", &removed(&stages, k)).is_err());
        }
        let linear = one(linear::solve_3d(&s)).unwrap();
        outputs_complete("linear", &linear).unwrap();
        assert!(outputs_complete("linear", &removed(&linear, 0)).is_err());
    }

    #[test]
    fn a_nodal_stress_out_of_its_shell_block_fails() {
        let s = building_3d(1);
        let r = linear::solve_3d(&s).unwrap();
        nodal_stresses_3d(&s, &r).unwrap();
        let mut reordered = r.clone();
        reordered.quad_nodal_stresses.swap(0, 5);
        assert!(nodal_stresses_3d(&s, &reordered).is_err());
        let mut substituted = r.clone();
        substituted.quad_nodal_stresses[0] = r.quad_nodal_stresses[1].clone();
        assert!(nodal_stresses_3d(&s, &substituted).is_err());
    }

    #[test]
    fn only_declared_refusals_that_apply_pass_on_deterministic_models() {
        let shells = building_3d(0);
        let frames = frame_only(building_3d(0));
        let shell_refusal = "Corotational 3D solver does not support shell elements.";
        let violates = |analysis: &str, model: &str, s: &SolverInput3D, e: &str| gate(analysis, model, s, Err(e.into())).is_ok();
        assert!(!violates("corotational", "building_3d/0", &shells, shell_refusal));
        assert!(violates("corotational", "frame_3d/0", &frames, shell_refusal));
        assert!(violates("corotational", "frame_3d/0", &frames, "Corotational analysis does not support thermal loads (member 1)"));
        assert!(violates("linear", "building_3d/0", &shells, "Singular stiffness matrix"));
        assert!(violates("SSI", "frame_3d/0", &frames, "Soil-structure interaction analysis does not support prescribed support displacements"));
        assert!(violates("staged", "building_3d/0", &shells, "Staged construction analysis does not support curved shell elements"));
        assert!(!violates("linear", "fuzz_rich_3d/0", &shells, "leftHand: true is not supported"));
        let mut ledger = Ledger::default();
        ledger.record("corotational", "frame_3d/0", &[], gate("corotational", "frame_3d/0", &frames, Err(shell_refusal.into())));
        assert_eq!(ledger.violations.len(), 1);
    }

    #[test]
    fn missing_modes_fail() {
        mode_count("building_3d/0", MODES).unwrap();
        assert!(mode_count("building_3d/0", MODES - 1).is_err());
        assert!(mode_count("building_3d/0", 0).is_err());
        assert!(mode_count("fuzz_rich_3d/0", 0).is_err());
        assert!(mode_count("fuzz_rich_3d/0", MODES + 1).is_err());
        mode_count("fuzz_rich_3d/0", 2).unwrap();
    }
}
