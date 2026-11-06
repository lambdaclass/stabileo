//! Nightly reproducers of harness tolerance defects, each replayed with its
//! reported seed, and deliberately wrong results that must still be caught.

use crate::case::{Case2, Case3};
use crate::response::{Resp, LOWER_BOUND};
use crate::tally::{Cell, Tally, Verdict};
use dedaliano_engine::metamorphic::compare::compare_with_compliance;
use dedaliano_engine::metamorphic::conditioning;
use dedaliano_engine::metamorphic::relabel::Relabel;
use dedaliano_engine::metamorphic::transform::Iso2;
use dedaliano_engine::metamorphic::units::Units;
use std::collections::BTreeMap;

type Cells = BTreeMap<(String, String), Cell>;

enum Model {
    D2(Case2),
    D3(Case3),
}

fn model(issue: u32) -> Model {
    let text = std::fs::read_to_string(format!("{}/tests/metamorphic_corpus/nightly/issue-{issue}.json", env!("CARGO_MANIFEST_DIR"))).unwrap();
    let meta: serde_json::Value = serde_json::from_str(&text).unwrap();
    let dens: Option<std::collections::HashMap<String, f64>> = meta.get("_nightly_dens").map(|d| serde_json::from_value(d.clone()).unwrap());
    let name = format!("issue-{issue}");
    match crate::corpus::parse(&text).unwrap() {
        crate::corpus::Model::D2(s) => {
            let mut c = Case2::new(name, s);
            if let Some(d) = dens {
                c.dens = d;
            }
            Model::D2(c)
        }
        crate::corpus::Model::D3(s) => {
            let mut c = Case3::new(name, s);
            if let Some(d) = dens {
                c.dens = d;
            }
            Model::D3(c)
        }
    }
}

fn replay(issue: u32, seed: u64, cells: &[(&str, &str)]) -> Cells {
    let t = Tally::default();
    let wanted = |n: &str| cells.iter().any(|c| c.0 == n);
    let mut invariants: Vec<&str> = cells.iter().map(|c| c.1).filter(|i| *i != "symmetry").collect();
    invariants.dedup();
    let symmetry = cells.iter().any(|c| c.1 == "symmetry");
    match model(issue) {
        Model::D2(c) => {
            let anas: Vec<_> = crate::ana2::rows().into_iter().filter(|a| wanted(a.name)).collect();
            crate::checks2::check_case(&crate::checks2::Ctx { tally: &t, rng_seed: seed }, &c, &anas, &invariants);
            for anti in [false, true].into_iter().filter(|_| symmetry) {
                if let Some(sym) = crate::symmetry::symmetrize_2d(&c.name, &c.s, anti) {
                    crate::symmetry::check_2d(&t, &sym, anti, &anas);
                }
            }
        }
        Model::D3(c) => {
            let anas: Vec<_> = crate::ana3::rows().into_iter().filter(|a| wanted(a.name)).collect();
            crate::checks3::check_case(&crate::checks3::Ctx { tally: &t, rng_seed: seed }, &c, &anas, &invariants);
            for anti in [false, true].into_iter().filter(|_| symmetry) {
                if let Some(sym) = crate::symmetry::symmetrize_3d(&c.name, &c.s, anti) {
                    crate::symmetry::check_3d(&t, &sym, anti, &anas);
                }
            }
        }
    }
    let cells = t.cells.lock().unwrap().clone();
    cells
}

fn cell<'a>(cells: &'a Cells, issue: u32, a: &str, i: &str) -> &'a Cell {
    cells.get(&(a.to_string(), i.to_string())).unwrap_or_else(|| panic!("#{issue}: {a} × {i} not run"))
}

fn holds(issue: u32, seed: u64, cells: &[(&str, &str)]) {
    let got = replay(issue, seed, cells);
    for &(a, i) in cells {
        let c = cell(&got, issue, a, i);
        assert!(c.fails.is_empty(), "#{issue}: {a} × {i}: {:?}", c.fails);
        assert!(c.pass > 0, "#{issue}: {a} × {i} did not complete: {c:?}");
    }
}

fn inconclusive(issue: u32, seed: u64, cells: &[(&str, &str)]) {
    let got = replay(issue, seed, cells);
    for &(a, i) in cells {
        let c = cell(&got, issue, a, i);
        assert!(c.fails.is_empty(), "#{issue}: {a} × {i}: {:?}", c.fails);
        assert!(c.inconclusive > 0, "#{issue}: {a} × {i} not reported inconclusive: {c:?}");
    }
}

fn ana2(name: &str) -> crate::ana2::Ana2 {
    crate::ana2::rows().into_iter().find(|a| a.name == name).unwrap()
}

fn ana3(name: &str) -> crate::ana3::Ana3 {
    crate::ana3::rows().into_iter().find(|a| a.name == name).unwrap()
}

fn nudge(r: &mut Resp, tag: &str, node: Option<usize>, k: usize, by: f64) {
    let it = r.0.iter_mut().find(|i| i.tag == tag && i.node == node).unwrap_or_else(|| panic!("no {tag}"));
    it.v[k] += by;
}

/// #1262, #1268, #1273: results that are zero in exact arithmetic.
#[test]
fn zero_results_compare_on_their_natural_scale() {
    holds(1262, 20760, &[
        ("time history", "rotation"), ("time history", "mirror"), ("linear", "mirror"), ("linear (sparse path)", "rotation"),
        ("linear (dense reference)", "rotation"), ("load combinations", "mirror"), ("staged (one stage)", "rotation"),
    ]);
    holds(1268, 2026110301179, &[("linear", "symmetry"), ("linear (sparse path)", "symmetry"), ("load combinations", "symmetry"), ("constrained", "symmetry")]);
    holds(1273, 2026110300325, &[("spectral", "reversal"), ("spectral", "rotation"), ("spectral", "units")]);
}

/// #1262, where every true translation is zero.
#[test]
fn a_wrong_displacement_on_the_compliance_floor_is_caught() {
    let Model::D2(c) = model(1262) else { panic!("2D") };
    let a = ana2("time history");
    let iso = Iso2::rotation(0.7).translated(3.0, -2.0);
    let tc = c.iso(&iso).unwrap();
    let cond = crate::checks2::with_eigen_2d(conditioning::of_2d(&c.s).unwrap(), &c).worst(&conditioning::of_2d(&tc.s).unwrap());
    let rel = crate::checks2::rel_for(a.name, a.iter_tol, &cond);
    let floor = crate::checks2::load_floor_2d(&tc.s, cond.lchar);
    let expected = (a.run)(&c).unwrap().iso2(&iso).unwrap();
    let mut got = (a.run)(&tc).unwrap();
    let cmp = |got: &Resp| compare_with_compliance(&got.flat(), &expected.flat(), cond.lchar, rel, floor, crate::checks2::compliance(a.name, &cond));
    cmp(&got).unwrap();
    let natural = floor * crate::checks2::compliance(a.name, &cond)[0];
    assert!(natural > 0.0 && natural < 1e-3, "F / kmax = {natural}");
    nudge(&mut got, "u_t020", Some(2), 0, 1e-6 * natural);
    assert!(cmp(&got).is_err(), "a translation of 1e-6·F/kmax passed");
}

/// #1266, #1273, #1274, #1275 (= #1276), #1282, #1283.
#[test]
fn time_history_tolerance_covers_the_damping_eigensolve() {
    holds(1266, 2026110303009, &[("time history (ground motion)", "units")]);
    holds(1273, 2026110300325, &[("time history (ground motion)", "units")]);
    holds(1274, 2026110305669, &[("time history (ground motion)", "units")]);
    holds(1275, 2026110300085, &[("time history", "rotation"), ("time history", "reversal"), ("time history", "units")]);
    holds(1283, 2026110301455, &[("time history", "rotation"), ("time history", "superposition"), ("time history", "units")]);
    holds(1282, 2026110300657, &[("time history (ground motion)", "rotation")]);
}

#[test]
fn a_wrong_time_history_is_caught() {
    let Model::D3(c) = model(1283) else { panic!("3D") };
    let a = ana3("time history");
    let u = Units::froude(0.3048, 4.448);
    let tc = c.units(&u);
    let cond = crate::checks3::with_eigen_3d(conditioning::of_3d(&c.s).unwrap(), &c).worst(&conditioning::of_3d(&tc.s).unwrap());
    let rel = crate::checks2::rel_for(a.name, a.iter_tol, &cond);
    assert!(rel < 2e-7, "rel = {rel:e}");
    let floor = crate::checks3::load_floor_3d(&tc.s, cond.lchar);
    let expected = (a.run)(&c).unwrap().units(&u);
    let mut got = (a.run)(&tc).unwrap();
    let cmp = |got: &Resp| compare_with_compliance(&got.flat(), &expected.flat(), cond.lchar, rel, floor, crate::checks2::compliance(a.name, &cond));
    cmp(&got).unwrap();
    let scale = got.flat().r.maxabs();
    nudge(&mut got, "r_t030", Some(2), 0, 1e-6 * scale);
    assert!(cmp(&got).is_err(), "a rotation history wrong by 1e-6 of scale passed");
    nudge(&mut got, "r_t030", Some(2), 0, -1e-6 * scale);
    let scale = got.flat().t.maxabs().max(got.flat().r.maxabs() * cond.lchar);
    nudge(&mut got, "u_t030", Some(2), 1, 1e-6 * scale);
    assert!(cmp(&got).is_err(), "a displacement history wrong by 1e-6 of scale passed");
}

/// #1282; #1267 and #1278 are near-mechanisms whose pencils span 1e12.
#[test]
fn eigen_based_rows_account_for_spread_and_gaps() {
    holds(1282, 2026110300657, &[("modal", "relabel"), ("modal", "units"), ("certified modal", "relabel"), ("certified modal", "units")]);
    inconclusive(1267, 2026110303012, &[("modal", "symmetry"), ("certified modal", "symmetry"), ("spectral", "symmetry")]);
    inconclusive(1278, 2026110303012, &[("spectral", "symmetry")]);
}

#[test]
fn a_wrong_effective_mass_is_caught() {
    let frame: dedaliano_engine::types::SolverInput3D = serde_json::from_value(serde_json::json!({
        "nodes": {
            "1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "y": 0.0, "z": 3.0},
            "3": {"id": 3, "x": 4.0, "y": 0.0, "z": 3.0}, "4": {"id": 4, "x": 4.0, "y": 0.0, "z": 0.0}
        },
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 2e-4, "j": 1e-5}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1},
            "3": {"id": 3, "type": "frame", "nodeI": 3, "nodeJ": 4, "materialId": 1, "sectionId": 1}
        },
        "supports": {
            "1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true},
            "2": {"nodeId": 4, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}
        },
        "loads": []
    }))
    .unwrap();
    let plain = Case3::new("portal", frame);
    let Model::D3(pathological) = model(1282) else { panic!("3D") };
    for (c, max_rel) in [(plain, 1e-8), (pathological, 1e-3)] {
        let a = ana3("modal");
        let rl = Relabel::random_3d(&c.s, 7);
        let tc = c.relabel(&rl, 7);
        let cond = crate::checks3::with_eigen_3d(conditioning::of_3d(&c.s).unwrap(), &c).worst(&conditioning::of_3d(&tc.s).unwrap());
        let rel = crate::checks2::rel_for(a.name, a.iter_tol, &cond);
        assert!(rel < max_rel, "{}: rel = {rel:e}", c.name);
        let base = (a.run)(&c).unwrap();
        let expected = base.relabel(&rl);
        let mut got = (a.run)(&tc).unwrap();
        let judge = |got: &Resp| crate::checks2::judge_split(got, &expected, rel, crate::checks2::rel_without_eigen(a.name, a.iter_tol, &cond), |g, e, rel| compare_with_compliance(&g.flat(), &e.flat(), cond.lchar, rel, 0.0, crate::checks2::compliance(a.name, &cond)));
        assert!(matches!(judge(&got), Verdict::Pass(_)), "{}: {:?}", c.name, judge(&got));
        let total = got.0.iter().find(|i| i.tag == "total_mass").unwrap().v[0];
        let widened = crate::response::widened_past(&expected, rel, conditioning::INCONCLUSIVE);
        let tag = got.0.iter().find(|i| i.tag.starts_with("meff") && !widened.contains(&i.tag)).unwrap_or_else(|| panic!("{}: no separated mode", c.name)).tag.clone();
        let by = if max_rel < 1e-6 { 1e-6 } else { 1e-2 } * total;
        nudge(&mut got, &tag, None, 0, by);
        assert!(matches!(judge(&got), Verdict::Fail(_)), "{}: {tag} wrong by {by:e} not caught", c.name);
    }
}

/// #1272.
#[test]
fn the_reported_plastic_units_pair_holds() {
    holds(1272, 2026110303871, &[("plastic collapse", "units")]);
}

#[test]
fn a_lower_bound_above_the_collapse_factor_is_caught() {
    let factor = |v: f64, bound: bool| {
        let mut r = Resp::default();
        r.scalar("collapse_factor", crate::response::Dim::NONE, v);
        if bound {
            r.scalar(LOWER_BOUND, crate::response::Dim::NONE, 1.0);
        }
        r
    };
    let rel = 1e-6;
    assert!(crate::checks2::bounded(&factor(2.0, false), &factor(2.0, false), rel).is_none());
    assert!(matches!(crate::checks2::bounded(&factor(1.5, true), &factor(2.0, false), rel), Some(Verdict::Inconclusive(_))));
    assert!(matches!(crate::checks2::bounded(&factor(2.0, false), &factor(1.5, true), rel), Some(Verdict::Inconclusive(_))));
    assert!(matches!(crate::checks2::bounded(&factor(2.01, true), &factor(2.0, false), rel), Some(Verdict::Fail(_))));
    assert!(matches!(crate::checks2::bounded(&factor(2.0, false), &factor(2.01, true), rel), Some(Verdict::Fail(_))));
    assert!(matches!(crate::checks2::bounded(&factor(3.0, true), &factor(1.0, true), rel), Some(Verdict::Inconclusive(_))));
}

#[test]
fn a_widened_effective_mass_tolerance_past_the_limit_is_inconclusive_and_the_rest_still_checked() {
    let factor = crate::response::eigen_gap_factor(1.0, 1.0005);
    assert!(factor > 900.0, "{factor}");
    let mut r = Resp::default();
    r.scalar("total_mass", crate::response::Dim::MASS, 10.0);
    r.scalar("f00", crate::response::Dim(0, 0, -1), 3.0);
    r.push(None, None, "meff00", crate::response::Kind::T3(crate::response::Dim::MASS), vec![4.0; 6]);
    r.set_floor("meff00", 10.0 * factor);
    assert!((crate::response::gap_amplification(&r, "meff00") - factor).abs() < 1e-9 * factor);
    let rel = 2e-6;
    let cmp = |g: &Resp, e: &Resp, rel: f64| dedaliano_engine::metamorphic::compare::compare(&g.flat(), &e.flat(), 1.0, rel);
    let mut wrong_mass = r.clone();
    nudge(&mut wrong_mass, "meff00", None, 0, 0.01);
    assert!(cmp(&wrong_mass, &r, rel).is_ok(), "the widened tolerance alone passes a 0.1 %-of-mass error");
    assert!(matches!(crate::checks2::judge_split(&wrong_mass, &r, rel, rel, cmp), Verdict::Inconclusive(_)));
    let mut wrong_frequency = wrong_mass.clone();
    nudge(&mut wrong_frequency, "f00", None, 0, 3e-4);
    assert!(matches!(crate::checks2::judge_split(&wrong_frequency, &r, rel, rel, cmp), Verdict::Fail(_)));
    let mut wrong_total = wrong_mass.clone();
    nudge(&mut wrong_total, "total_mass", None, 0, 1e-3);
    assert!(matches!(crate::checks2::judge_split(&wrong_total, &r, rel, rel, cmp), Verdict::Fail(_)));
    assert!(matches!(crate::checks2::judge_split(&r.clone(), &r, rel, rel, cmp), Verdict::Inconclusive(_)));
    let mut tight = r.clone();
    tight.set_floor("meff00", 10.0);
    assert!(matches!(crate::checks2::judge_split(&tight.clone(), &tight, rel, rel, cmp), Verdict::Pass(_)));
}

#[test]
fn only_an_incomplete_collapse_refusal_is_inconclusive_next_to_a_lower_bound() {
    let refusal = "Plastic (pushover) analysis: after λ = 9669.504276 no section reaches its plastic moment under further load and the structure is not a mechanism — the loads are carried without bending (axially), so a bending-only plastic analysis has no collapse factor to report. Check axial capacity and buckling instead.";
    assert!(crate::response::incomplete_collapse(refusal));
    for other in ["did not converge", "PANIC: index out of bounds", "Plastic (pushover) analysis needs a mechanical load to scale to collapse", "singular stiffness matrix"] {
        assert!(!crate::response::incomplete_collapse(other), "{other}");
    }
}

#[test]
fn compliance_floors_follow_the_compared_units() {
    let Model::D3(c) = model(1283) else { panic!("3D") };
    let base = conditioning::of_3d(&c.s).unwrap();
    for u in [Units::froude(10.0, 1.0), Units::froude(0.1, 1.0)] {
        let other = conditioning::of_3d(&c.units(&u).s).unwrap();
        let both = base.worst(&other).compliance();
        assert!(other.compliance()[0] > 0.0 && (other.compliance()[0] - base.compliance()[0]).abs() > 1e-3 * other.compliance()[0]);
        assert_eq!(both, other.compliance());
        assert_eq!(base.worst(&other).lchar, other.lchar);
    }
}

#[test]
fn total_mass_keeps_its_tolerance_when_the_eigen_budget_is_inconclusive() {
    let mut r = Resp::default();
    r.scalar("total_mass", crate::response::Dim::MASS, 10.0);
    r.scalar("f00", crate::response::Dim(0, 0, -1), 3.0);
    let cmp = |g: &Resp, e: &Resp, rel: f64| dedaliano_engine::metamorphic::compare::compare(&g.flat(), &e.flat(), 1.0, rel);
    let (wide, base) = (2e-3, 1e-12);
    let mut wrong = r.clone();
    nudge(&mut wrong, "total_mass", None, 0, 1e-6);
    assert!(matches!(crate::checks2::judge_split(&wrong, &r, wide, base, cmp), Verdict::Fail(_)));
    assert!(matches!(crate::checks2::judge_split(&r.clone(), &r, wide, base, cmp), Verdict::Inconclusive(_)));
    let mut slightly = r.clone();
    nudge(&mut slightly, "total_mass", None, 0, 1e-4);
    assert!(matches!(crate::checks2::judge_split(&slightly, &r, 2e-4, base, cmp), Verdict::Fail(_)));
}

#[test]
fn same_model_checks_carry_no_eigen_budget() {
    let Model::D3(c) = model(1283) else { panic!("3D") };
    let cond = crate::checks3::with_eigen_3d(conditioning::of_3d(&c.s).unwrap(), &c);
    let a = ana3("time history");
    assert!(cond.eig > 0.0);
    let (with, without) = (crate::checks2::rel_for(a.name, a.iter_tol, &cond), crate::checks2::rel_without_eigen(a.name, a.iter_tol, &cond));
    assert!((with - without - 2.0 * cond.eig).abs() <= 1e-12 * with, "{with} {without} {}", cond.eig);
}

#[test]
fn a_bound_check_past_the_reliability_limit_is_inconclusive() {
    let factor = |v: f64, bound: bool| {
        let mut r = Resp::default();
        r.scalar("collapse_factor", crate::response::Dim::NONE, v);
        if bound {
            r.scalar(LOWER_BOUND, crate::response::Dim::NONE, 1.0);
        }
        r
    };
    assert!(matches!(crate::checks2::bounded(&factor(2.01, true), &factor(2.0, false), 2e-3), Some(Verdict::Inconclusive(_))));
    assert!(matches!(crate::checks2::bounded(&factor(2.01, true), &factor(2.0, false), 1e-4), Some(Verdict::Fail(_))));
}
