//! The per-PR invariance tier: docs/verification/METAMORPHIC.md, "Corpus and tiers".

use crate::case::{Case2, Case3};
use crate::corpus::{self, Model};
use crate::tally::{Tally, Verdict};
use crate::{ana2, ana3, checks2, checks3};
use std::collections::BTreeSet;
use std::time::Instant;

/// EXPECTED is keyed by seed: changing one changes every transform drawn from it.
const SEEDS: &[u64] = &[20754, 20261105];

pub const INVARIANTS_2D: &[&str] = &["rotation", "mirror", "relabel", "reversal", "units", "load order"];
pub const INVARIANTS_3D: &[&str] = &["rotation", "relabel", "reversal", "units", "load order"];

const ALL: &[&str] = &["*"];
const LINEAR: &[&str] = &["linear", "linear (dense reference)", "linear (sparse path)", "linear (PCG)", "certified linear"];
const DYNAMIC: &[&str] = &["modal", "certified modal", "spectral", "time history", "time history (ground motion)", "harmonic"];
const NONLINEAR: &[&str] = &["corotational", "material nonlinear", "fiber nonlinear"];

/// Changed path prefix → analyses it can change. The first matching prefix wins; an engine
/// source path with no entry runs every analysis, any other path none.
pub const PATH_KINDS: &[(&str, &[&str])] = &[
    ("engine/src/solver/load_cases.rs", &["load combinations"]),
    ("engine/src/solver/staged.rs", &["staged (one stage)", "staged (loads in two stages)"]),
    ("engine/src/solver/winkler.rs", &["Winkler (no foundation)"]),
    ("engine/src/solver/contact.rs", &["contact (no gaps)"]),
    ("engine/src/solver/ssi.rs", &["SSI (no soil springs)"]),
    ("engine/src/solver/soil_curves.rs", &["SSI (no soil springs)"]),
    ("engine/src/solver/creep_shrinkage.rs", &["creep & shrinkage (t = t0)"]),
    ("engine/src/solver/pdelta.rs", &["P-Delta"]),
    ("engine/src/solver/geometric_stiffness.rs", &["P-Delta", "buckling", "corotational"]),
    ("engine/src/solver/buckling.rs", &["buckling"]),
    ("engine/src/solver/corotational.rs", NONLINEAR),
    ("engine/src/solver/arc_length.rs", NONLINEAR),
    ("engine/src/solver/adaptive_stepping.rs", NONLINEAR),
    ("engine/src/solver/line_search.rs", NONLINEAR),
    ("engine/src/solver/sparse_tangent.rs", NONLINEAR),
    ("engine/src/solver/material_nonlinear.rs", &["material nonlinear"]),
    ("engine/src/solver/fiber_nonlinear.rs", &["fiber nonlinear"]),
    ("engine/src/solver/cable.rs", &["cable solver"]),
    ("engine/src/solver/modal.rs", DYNAMIC),
    ("engine/src/solver/mass_matrix.rs", DYNAMIC),
    ("engine/src/solver/damping.rs", DYNAMIC),
    ("engine/src/solver/dynamic_validation.rs", DYNAMIC),
    ("engine/src/solver/time_integration.rs", &["time history", "time history (ground motion)"]),
    ("engine/src/solver/spectral.rs", &["spectral"]),
    ("engine/src/solver/harmonic.rs", &["harmonic"]),
    ("engine/src/solver/plastic.rs", &["plastic collapse"]),
    ("engine/src/solver/plastic_3d.rs", &["plastic collapse"]),
    ("engine/src/solver/kinematic.rs", &["kinematic check", "plastic collapse"]),
    ("engine/src/solver/moving_loads.rs", &["moving loads", "influence line"]),
    ("engine/src/certify/modal.rs", &["certified modal"]),
    ("engine/src/certify/plastic", &["plastic collapse"]),
    ("engine/src/certify/", &["certified linear", "certified modal"]),
    ("engine/src/section/", &["plastic collapse", "fiber nonlinear"]),
    ("engine/src/kani_proofs.rs", &[]),
    ("engine/src/", ALL),
    ("engine/tests/metamorphic/", ALL),
    ("engine/tests/metamorphic_corpus/", ALL),
    ("engine/tests/fuzz_models/", ALL),
    ("engine/tests/fixtures/", ALL),
    ("engine/Cargo.toml", ALL),
    ("Cargo.lock", ALL),
    ("rust-toolchain.toml", ALL),
];

#[derive(Debug, PartialEq)]
pub enum Selection {
    All,
    Some(BTreeSet<&'static str>),
}

impl Selection {
    pub fn has(&self, analysis: &str) -> bool {
        match self {
            Selection::All => true,
            Selection::Some(s) => s.contains(analysis),
        }
    }
}

pub fn select<'a>(paths: impl IntoIterator<Item = &'a str>) -> Selection {
    let mut out = BTreeSet::new();
    for p in paths.into_iter().map(str::trim).filter(|p| !p.is_empty()) {
        let Some((_, kinds)) = PATH_KINDS.iter().find(|(prefix, _)| p.starts_with(prefix)) else { continue };
        if *kinds == ALL {
            return Selection::All;
        }
        out.extend(kinds.iter().copied());
    }
    Selection::Some(out)
}

/// `INVARIANCE_KINDS` (comma-separated analysis names, or `all`) wins over `INVARIANCE_PATHS`
/// (the changed files, one per line); with neither set every analysis runs.
fn selection_from_env() -> Selection {
    if let Ok(k) = std::env::var("INVARIANCE_KINDS") {
        if !k.trim().is_empty() {
            if k.trim() == "all" {
                return Selection::All;
            }
            let names: BTreeSet<&'static str> = k.split(',').map(str::trim).filter(|n| !n.is_empty()).map(|n| known_name(n).unwrap_or_else(|| panic!("INVARIANCE_KINDS: no analysis named {n:?}"))).collect();
            return Selection::Some(names);
        }
    }
    match std::env::var("INVARIANCE_PATHS") {
        Ok(p) => select(p.lines()),
        Err(_) => Selection::All,
    }
}

fn analysis_names() -> BTreeSet<&'static str> {
    ana2::rows().iter().map(|a| a.name).chain(ana3::rows().iter().map(|a| a.name)).collect()
}

fn known_name(n: &str) -> Option<&'static str> {
    analysis_names().into_iter().find(|a| *a == n)
}

pub struct Expected {
    pub seed: u64,
    pub case: &'static str,
    pub analysis: &'static str,
    pub invariant: &'static str,
    pub issue: u32,
    pub refused: bool,
}

impl Expected {
    fn key(&self) -> String {
        format!("{}:{}", self.seed, self.case)
    }
}

const fn xfail(seed: u64, case: &'static str, analysis: &'static str, invariant: &'static str, issue: u32) -> Expected {
    Expected { seed, case, analysis, invariant, issue, refused: false }
}

/// A failure the engine now withholds instead of returning: when the refusal is lifted it turns back into `xfail` or, fixed, is removed.
const fn xrefused(seed: u64, case: &'static str, analysis: &'static str, invariant: &'static str, issue: u32) -> Expected {
    Expected { seed, case, analysis, invariant, issue, refused: true }
}

/// Each xfail must still fail and each xrefused must still be refused: the fix of its issue removes it.
pub const EXPECTED: &[Expected] = &[
    xrefused(20754, "fuzz_rich_2d/20843", "plastic collapse", "relabel", 758),
    xrefused(20754, "fuzz_rich_2d/20843", "plastic collapse", "reversal", 758),
    xrefused(20754, "fuzz_rich_2d/20843", "plastic collapse", "rotation", 758),
    xrefused(20754, "fuzz_rich_2d/20843", "plastic collapse", "units", 758),
    xfail(20754, "feature_matrix/3d-curved-beam-arch-with", "plastic collapse", "rotation", 758),
    xfail(20754, "fuzz_rich_2d/20772", "P-Delta", "units", 971),
    xrefused(20261105, "fuzz_rich_2d/20832", "plastic collapse", "reversal", 758),
    xrefused(20261105, "fuzz_rich_2d/20843", "plastic collapse", "relabel", 758),
    xrefused(20261105, "fuzz_rich_2d/20843", "plastic collapse", "reversal", 758),
    xrefused(20261105, "fuzz_rich_2d/20843", "plastic collapse", "rotation", 758),
    xrefused(20261105, "fuzz_rich_2d/20843", "plastic collapse", "units", 758),
    xfail(20261105, "feature_matrix/3d-curved-beam-arch-with", "plastic collapse", "rotation", 758),
    xfail(20261105, "fuzz_rich_2d/20772", "P-Delta", "units", 971),
    xfail(20261105, "feature_matrix/3d-local-axes--roll-angle--rolled-90--with", "corotational", "rotation", 971),
];

fn fixture(name: &str) -> Model {
    let path = corpus::root().join("fixtures").join(format!("{name}-input.json"));
    corpus::parse(&std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()))).unwrap_or_else(|| panic!("{}: not a model", path.display()))
}

fn feature(name: &str) -> Model {
    let path = corpus::root().join("metamorphic_corpus/feature_matrix").join(format!("{name}.json"));
    corpus::parse(&std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()))).unwrap_or_else(|| panic!("{}: not a model", path.display()))
}

const FIXTURES_2D: &[&str] = &["ex-portal-frame", "ex-gerber-beam", "ex-three-hinge-arch", "ex-warren-truss", "ex-settlement", "ex-spring-support", "ex-bridge-moving-load", "ex-thermal", "ex-two-story-frame"];
const FEATURES_2D: &[&str] = &[
    "2d-constraint--rigid-link--offset-beam-with",
    "2d-connector-axial-connector-with",
    "2d-inclined-support-roller-at-30--with",
    "2d-hinge--moment-release--released-into-support-with",
    "2d-constraint--equaldof--tied-coincident-nodes-with",
    "2d-point-load-on-member-cantilever-with",
    "2d-trapezoidal-distributed-load-cantilever-with",
];
/// `corpus::fuzz_case_2d(base, k)`: `fuzz_rich_2d/{base + k}` as the nightly run from `base` builds it.
const FUZZ_2D: &[(u64, u64)] = &[(20754, 86), (20754, 78), (20754, 18), (20754, 89), (0, 0), (0, 1)];
const FIXTURES_3D: &[&str] = &["ex-3d-portal-frame", "ex-3d-space-truss", "ex-3d-torsion-beam", "cantilever-3d"];
const FEATURES_3D: &[&str] = &[
    "3d-curved-beam-arch-with",
    "3d-constraint--diaphragm--two-columns-with",
    "3d-constraint--rigid-link--offset-beam-with",
    "3d-local-axes--roll-angle--rolled-90--with",
    "3d-member-end-release-released-into-support-with",
    "3d-inclined-support-roller-normal-at-30--with",
    "3d-quad-shell--mitc4--strip-cantilever------0-with",
    "3d-connector-axial-connector-with",
];
const FUZZ_3D: &[(u64, u64)] = &[(0, 0), (0, 1)];

pub fn cases_2d() -> Vec<Case2> {
    let named = FIXTURES_2D.iter().map(|n| (n.to_string(), fixture(n))).chain(FEATURES_2D.iter().map(|n| (format!("feature_matrix/{n}"), feature(n))));
    let mut out: Vec<Case2> = named.map(|(n, m)| match m {
        Model::D2(s) => Case2::new(n, s),
        Model::D3(_) => panic!("{n} is a 3D model"),
    }).collect();
    out.extend(FUZZ_2D.iter().map(|&(base, k)| corpus::fuzz_case_2d(base, k)));
    out
}

pub fn cases_3d() -> Vec<Case3> {
    let named = FIXTURES_3D.iter().map(|n| (n.to_string(), fixture(n))).chain(FEATURES_3D.iter().map(|n| (format!("feature_matrix/{n}"), feature(n))));
    let mut out: Vec<Case3> = named.map(|(n, m)| match m {
        Model::D3(s) => Case3::new(n, s),
        Model::D2(_) => panic!("{n} is a 2D model"),
    }).collect();
    out.extend(FUZZ_3D.iter().map(|&(base, k)| corpus::fuzz_case_3d(base, k)));
    out
}

#[derive(Default)]
pub struct Outcome {
    pub fails: Vec<(String, String, String, String)>,
    pub passed: BTreeSet<(String, String, String)>,
    pub cells: Vec<(String, String, String, &'static str)>,
}

fn collect(out: &mut Outcome, case: &str, t: &Tally) {
    let cells = t.cells.lock().unwrap();
    for ((a, i), c) in cells.iter() {
        let state = if !c.fails.is_empty() {
            for f in &c.fails {
                out.fails.push((case.to_string(), a.clone(), i.clone(), f.clone()));
            }
            "fail"
        } else if c.pass > 0 {
            out.passed.insert((case.to_string(), a.clone(), i.clone()));
            "pass"
        } else if c.inconclusive > 0 {
            "inconclusive"
        } else if c.same_refusal > 0 && c.refused == 0 {
            "same refusal"
        } else if c.refused > 0 {
            "refused"
        } else if c.unrep > 0 {
            "unrepresentable"
        } else {
            "n/a"
        };
        out.cells.push((case.to_string(), a.clone(), i.clone(), state));
    }
}

pub fn run(sel: &Selection) -> Outcome {
    let mut out = Outcome::default();
    let anas2: Vec<_> = ana2::rows().into_iter().filter(|a| sel.has(a.name)).collect();
    if !anas2.is_empty() {
        for c in cases_2d() {
            for &seed in SEEDS {
                let t = Tally::default();
                checks2::check_case(&checks2::Ctx { tally: &t, rng_seed: seed }, &c, &anas2, INVARIANTS_2D);
                collect(&mut out, &format!("{seed}:{}", c.name), &t);
            }
        }
    }
    let anas3: Vec<_> = ana3::rows().into_iter().filter(|a| sel.has(a.name)).collect();
    if !anas3.is_empty() {
        for c in cases_3d() {
            for &seed in SEEDS {
                let t = Tally::default();
                checks3::check_case(&checks3::Ctx { tally: &t, rng_seed: seed }, &c, &anas3, INVARIANTS_3D);
                collect(&mut out, &format!("{seed}:{}", c.name), &t);
            }
        }
    }
    out
}

pub fn judge(sel: &Selection, out: &Outcome, expected: &[Expected]) -> Vec<String> {
    let mut problems = Vec::new();
    let is_expected = |case: &str, a: &str, i: &str| expected.iter().find(|e| e.key() == case && e.analysis == a && e.invariant == i);
    for (case, a, i, msg) in &out.fails {
        if is_expected(case, a, i).is_none() {
            problems.push(format!("NEW FAILURE [{a} × {i}] {case}: {msg}"));
        }
    }
    for e in expected.iter().filter(|e| sel.has(e.analysis) && e.refused) {
        let key = e.key();
        let state = out.cells.iter().find(|(c, a, i, _)| *c == key && a == e.analysis && i == e.invariant).map_or("not run", |x| x.3);
        if state != "same refusal" || registered_refusal(e.issue).is_empty() || admitted_refusals(e.analysis) != registered_refusal(e.issue) {
            problems.push(format!("EXPECTED REFUSAL NOW {} [{} × {}] {key} (#{}): the refusal no longer holds; make it an xfail again, or remove it once #{} is fixed", state.to_uppercase(), e.analysis, e.invariant, e.issue, e.issue));
        }
    }
    for e in expected.iter().filter(|e| sel.has(e.analysis) && !e.refused) {
        let key = e.key();
        if !out.fails.iter().any(|(c, a, i, _)| *c == key && a == e.analysis && i == e.invariant) {
            let state = out.cells.iter().find(|(c, a, i, _)| *c == key && a == e.analysis && i == e.invariant).map_or("not run", |x| x.3);
            problems.push(format!("EXPECTED FAILURE NOW {} [{} × {}] {key} (#{}): remove its entry from quick::EXPECTED and verify the fix of #{}", state.to_uppercase(), e.analysis, e.invariant, e.issue, e.issue));
        }
    }
    for a in analysis_names().into_iter().filter(|a| sel.has(a)) {
        if !out.passed.iter().any(|(_, x, _)| x == a) && !out.fails.iter().any(|(_, x, _, _)| x == a) {
            problems.push(format!("NO COVERAGE [{a}]: no curated model completed a comparison"));
        }
    }
    problems
}

fn registered_refusal(issue: u32) -> Vec<(String, u64)> {
    use dedaliano_engine::known_issues::{Mode, ENTRIES};
    ENTRIES.iter().filter(|e| e.issue == issue && e.mode == Mode::Refuse).map(|e| (e.id.to_string(), u64::from(e.issue))).collect()
}

fn admitted_refusals(analysis: &str) -> Vec<(String, u64)> {
    use dedaliano_engine::known_issues::{Mode, ENTRIES};
    ENTRIES.iter().filter(|e| e.mode == Mode::Refuse)
        .map(|e| (e.id.to_string(), u64::from(e.issue)))
        .filter(|r| crate::response::scoped(analysis, true, false, crate::response::Resp(Vec::new(), vec![r.clone()])).is_ok())
        .collect()
}

fn summary(out: &Outcome) -> String {
    let mut by: std::collections::BTreeMap<(String, String), [usize; 7]> = Default::default();
    for (_, a, i, s) in &out.cells {
        let k = ["pass", "fail", "same refusal", "refused", "inconclusive", "unrepresentable", "n/a"].iter().position(|x| x == s).unwrap();
        by.entry((a.clone(), i.clone())).or_default()[k] += 1;
    }
    let mut s = String::from("analysis                           invariant     pass fail same-ref refused inconcl unrep n/a\n");
    for ((a, i), n) in by {
        s += &format!("{a:<34} {i:<12} {:>5} {:>4} {:>8} {:>7} {:>7} {:>5} {:>3}\n", n[0], n[1], n[2], n[3], n[4], n[5], n[6]);
    }
    s
}

#[test]
#[ignore = "per-PR tier: make test.engine.invariance.quick"]
fn invariance_quick() {
    let sel = selection_from_env();
    match &sel {
        Selection::All => println!("invariance quick: every analysis"),
        Selection::Some(s) if s.is_empty() => {
            println!("invariance quick: no solver module changed, nothing to run");
            return;
        }
        Selection::Some(s) => println!("invariance quick: {}", s.iter().copied().collect::<Vec<_>>().join(", ")),
    }
    let start = Instant::now();
    let out = run(&sel);
    println!("{}", summary(&out));
    println!("invariance quick: {} cells in {:.1} s", out.cells.len(), start.elapsed().as_secs_f64());
    for (case, a, i, msg) in &out.fails {
        let Some(e) = EXPECTED.iter().find(|e| e.key() == *case && e.analysis == a && e.invariant == i) else { continue };
        println!("expected failure (#{}) [{a} × {i}] {case}: {}", e.issue, msg.lines().next().unwrap_or(""));
    }
    let problems = judge(&sel, &out, EXPECTED);
    assert!(problems.is_empty(), "{} problem(s):\n{}", problems.len(), problems.join("\n"));
}

#[test]
fn every_mapped_analysis_exists() {
    let names = analysis_names();
    for (prefix, kinds) in PATH_KINDS {
        for k in kinds.iter().filter(|k| **k != "*") {
            assert!(names.contains(k), "{prefix}: no analysis named {k:?}");
        }
    }
    for e in EXPECTED {
        assert!(names.contains(e.analysis), "#{}: no analysis named {:?}", e.issue, e.analysis);
        assert!(INVARIANTS_2D.contains(&e.invariant) || INVARIANTS_3D.contains(&e.invariant), "#{}: no invariant {:?}", e.issue, e.invariant);
    }
}

#[test]
fn every_analysis_is_reachable_from_some_solver_path() {
    let reachable: BTreeSet<&str> = PATH_KINDS.iter().flat_map(|(_, k)| k.iter().copied()).collect();
    for a in analysis_names() {
        let only_all = !reachable.contains(a) && !LINEAR.contains(&a) && a != "constrained";
        assert!(!only_all, "{a}: only a change to a shared module selects it; map its own module in PATH_KINDS");
    }
}

#[test]
fn paths_select_their_analyses() {
    let s = |p: &[&str]| select(p.iter().copied());
    assert_eq!(s(&[]), Selection::Some(BTreeSet::new()));
    assert_eq!(s(&["web/src/App.svelte", "docs/x.md", "engine/tests/certify.rs"]), Selection::Some(BTreeSet::new()));
    assert_eq!(s(&["engine/src/solver/plastic.rs"]), Selection::Some(["plastic collapse"].into()));
    assert_eq!(s(&["engine/src/solver/plastic.rs", "engine/src/solver/harmonic.rs"]), Selection::Some(["plastic collapse", "harmonic"].into()));
    assert_eq!(s(&["engine/src/solver/assembly.rs"]), Selection::All);
    assert_eq!(s(&["engine/src/element/frame.rs"]), Selection::All);
    assert_eq!(s(&["engine/src/certify/plastic_3d.rs"]), Selection::Some(["plastic collapse"].into()));
    assert_eq!(s(&["engine/src/certify/linear.rs"]), Selection::Some(["certified linear", "certified modal"].into()));
    assert_eq!(s(&["engine/src/kani_proofs.rs"]), Selection::Some(BTreeSet::new()));
    assert_eq!(s(&["engine/tests/metamorphic/quick.rs"]), Selection::All);
}

#[test]
fn judge_flags_new_failures_and_expected_ones_that_pass() {
    let exp = [xfail(7, "m", "plastic collapse", "relabel", 1)];
    let sel = Selection::Some(["plastic collapse"].into());
    let fail = |c: &str, a: &str, i: &str| (c.to_string(), a.to_string(), i.to_string(), "x".to_string());
    let cell = |c: &str, a: &str, i: &str, s: &'static str| (c.to_string(), a.to_string(), i.to_string(), s);
    let mut out = Outcome { fails: vec![fail("7:m", "plastic collapse", "relabel")], cells: vec![cell("7:m", "plastic collapse", "relabel", "fail")], ..Default::default() };
    assert!(judge(&sel, &out, &exp).is_empty(), "{:?}", judge(&sel, &out, &exp));
    out.fails.push(fail("7:m", "plastic collapse", "units"));
    out.cells.push(cell("7:m", "plastic collapse", "units", "fail"));
    assert!(judge(&sel, &out, &exp)[0].starts_with("NEW FAILURE"));
    let out = Outcome { passed: [("7:m".into(), "plastic collapse".into(), "relabel".into())].into(), cells: vec![cell("7:m", "plastic collapse", "relabel", "pass")], ..Default::default() };
    assert!(judge(&sel, &out, &exp)[0].starts_with("EXPECTED FAILURE NOW PASS"));
    let out = Outcome { cells: vec![cell("7:m", "plastic collapse", "relabel", "refused")], ..Default::default() };
    let p = judge(&sel, &out, &exp);
    assert!(p[0].starts_with("EXPECTED FAILURE NOW REFUSED") && p[1].starts_with("NO COVERAGE"), "{p:?}");
    let p = judge(&Selection::Some(["harmonic"].into()), &Outcome::default(), &exp);
    assert_eq!(p, vec!["NO COVERAGE [harmonic]: no curated model completed a comparison".to_string()]);
    let ok = Outcome { passed: [("7:m".into(), "harmonic".into(), "units".into())].into(), cells: vec![cell("7:m", "harmonic", "units", "pass")], ..Default::default() };
    assert!(judge(&Selection::Some(["harmonic"].into()), &ok, &exp).is_empty());
}

#[test]
fn judge_holds_expected_refusals_to_their_refusal() {
    let exp = [xrefused(7, "m", "plastic collapse", "relabel", 758)];
    let sel = Selection::Some(["plastic collapse"].into());
    let cell = |s: &'static str| ("7:m".to_string(), "plastic collapse".to_string(), "relabel".to_string(), s);
    let covered = ("8:n".to_string(), "plastic collapse".to_string(), "units".to_string());
    let out = Outcome { passed: [covered.clone()].into(), cells: vec![cell("same refusal")], ..Default::default() };
    assert!(judge(&sel, &out, &exp).is_empty(), "{:?}", judge(&sel, &out, &exp));
    for state in ["refused", "n/a", "unrepresentable"] {
        let out = Outcome { passed: [covered.clone()].into(), cells: vec![cell(state)], ..Default::default() };
        assert!(judge(&sel, &out, &exp)[0].starts_with(&format!("EXPECTED REFUSAL NOW {}", state.to_uppercase())), "{state}: {:?}", judge(&sel, &out, &exp));
    }
    let unregistered = [xrefused(7, "m", "plastic collapse", "relabel", 1)];
    let out = Outcome { passed: [covered.clone()].into(), cells: vec![cell("same refusal")], ..Default::default() };
    assert!(judge(&sel, &out, &unregistered)[0].starts_with("EXPECTED REFUSAL NOW SAME REFUSAL"), "{:?}", judge(&sel, &out, &unregistered));
    let out = Outcome { passed: [covered.clone(), ("7:m".into(), "plastic collapse".into(), "relabel".into())].into(), cells: vec![cell("pass")], ..Default::default() };
    assert!(judge(&sel, &out, &exp)[0].starts_with("EXPECTED REFUSAL NOW PASS"));
    let out = Outcome { fails: vec![("7:m".into(), "plastic collapse".into(), "relabel".into(), "x".into())], cells: vec![cell("fail")], ..Default::default() };
    let p = judge(&sel, &out, &exp);
    assert!(p[0].starts_with("EXPECTED REFUSAL NOW FAIL") && !p.iter().any(|x| x.starts_with("NEW FAILURE")), "{p:?}");
}
