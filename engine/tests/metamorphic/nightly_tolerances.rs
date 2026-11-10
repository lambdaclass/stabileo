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
    let name = meta["_nightly_name"].as_str().unwrap_or("replay").to_owned();
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
    let symmetry = cells.iter().any(|c| c.1 == "symmetry");
    match model(issue) {
        Model::D2(c) => {
            let anas: Vec<_> = crate::ana2::rows().into_iter().filter(|a| wanted(a.name)).collect();
            crate::checks2::check_case(&crate::checks2::Ctx { tally: &t, rng_seed: seed }, &c, &anas, crate::INV_2D);
            for anti in [false, true].into_iter().filter(|_| symmetry) {
                if let Some(sym) = crate::symmetry::symmetrize_2d(&c.name, &c.s, anti) {
                    crate::symmetry::check_2d(&t, &sym, anti, &anas);
                }
            }
        }
        Model::D3(c) => {
            let anas: Vec<_> = crate::ana3::rows().into_iter().filter(|a| wanted(a.name)).collect();
            crate::checks3::check_case(&crate::checks3::Ctx { tally: &t, rng_seed: seed }, &c, &anas, crate::INV_3D);
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

#[test]
fn issue_1088_published_near_zero_response() {
    holds(1088, 20759, &[("linear (PCG)", "symmetry")]);
}

#[test]
fn issue_1089_published_near_zero_response() {
    holds(1089, 20759, &[("load combinations", "symmetry")]);
}

#[test]
fn issue_1100_published_near_zero_response() {
    holds(1100, 20759, &[("time history", "mirror")]);
}

#[test]
fn issue_1105_published_near_zero_response() {
    holds(1105, 20759, &[("linear (sparse path)", "units")]);
}

#[test]
fn issue_1194_published_near_zero_response() {
    holds(1194, 2026110204980, &[("time history", "symmetry")]);
}

#[test]
fn issue_1195_published_near_zero_response() {
    holds(1195, 2026110203579, &[("constrained", "symmetry")]);
}

#[test]
fn issue_1197_published_near_zero_response() {
    holds(1197, 2026110201437, &[("fiber nonlinear", "symmetry")]);
}

#[test]
fn issue_1198_published_near_zero_response() {
    holds(1198, 2026110203935, &[("creep & shrinkage (t = t0)", "symmetry")]);
}

#[test]
fn issue_1199_published_near_zero_response() {
    holds(1199, 2026110201708, &[("linear (sparse path)", "symmetry")]);
}

#[test]
fn issue_1201_published_near_zero_response() {
    holds(1201, 2026110205194, &[("linear (dense reference)", "symmetry")]);
}

#[test]
fn issue_1206_published_near_zero_response() {
    holds(1206, 2026110203439, &[("time history (ground motion)", "symmetry")]);
}

#[test]
fn issue_1268_published_near_zero_response() {
    holds(1268, 2026110301179, &[("linear (sparse path)", "symmetry")]);
}

#[test]
fn issue_1363_published_near_zero_response() {
    holds(1363, 2026110406943, &[("time history", "symmetry")]);
}

#[test]
fn issue_1206_seeded_ground_motion_errors_are_caught() {
    let Model::D3(c) = model(1206) else { panic!("3D") };
    let sym = crate::symmetry::symmetrize_3d(&c.name, &c.s, false).unwrap();
    let c = &sym.case;
    let a = ana3("time history (ground motion)");
    let cond = crate::checks3::with_eigen_3d(conditioning::of_3d(&c.s).unwrap(), c);
    let rel = crate::checks2::rel_for(a.name, a.iter_tol, &cond) * 2.0;
    let mass = dedaliano_engine::solver::mass_matrix::total_mass_by_direction_3d(&c.s, &c.dens);
    let force: f64 = mass.iter().zip(c.p.ground).map(|(m, g)| m * g.abs()).sum();
    assert_eq!(crate::checks3::action_floor_3d(c, a.name, cond.lchar), force);
    let natural = force * crate::checks2::compliance(a.name, &cond)[0];
    assert!(natural.is_finite() && natural > 0.0);
    let got = (a.run)(c).unwrap();
    let expected = got.iso3(&sym.iso).unwrap().relabel(&sym.pair).common(&got);
    let cmp = |g: &Resp| compare_with_compliance(&g.flat(), &expected.flat(), cond.lchar, rel, force, crate::checks2::compliance(a.name, &cond));
    cmp(&got).unwrap();
    let mut wrong = got.clone();
    nudge(&mut wrong, "u_t010", Some(2), 0, 2.0 * rel * natural);
    assert!(cmp(&wrong).is_err(), "a near-zero displacement wrong relative to mass times acceleration passed");
    let mut wrong = got.clone();
    nudge(&mut wrong, "u_t010", Some(2), 0, natural);
    assert!(cmp(&wrong).is_err(), "an ordinary displacement error passed");
}

#[test]
fn physical_floors_preserve_ordinary_response_boundaries() {
    use dedaliano_engine::metamorphic::compare::Flat;
    let rel = 1e-10;
    let (l, force, compliance) = (3.0, 7.0, [0.02, 0.03]);
    let natural = [force * compliance[0], force * l * compliance[1], force, force * l];
    for family in 0..4 {
        let push = |f: &mut Flat, v| match family {
            0 => f.push_t("value", v),
            1 => f.push_r("value", v),
            2 => f.push_f("value", v),
            _ => f.push_m("value", v),
        };
        for magnitude in [0.0, 100.0 * natural[family]] {
            let mut expected = Flat::default();
            push(&mut expected, magnitude);
            let cmp = |g: &Flat| compare_with_compliance(g, &expected, l, rel, force, compliance);
            cmp(&expected).unwrap();
            let scale = if magnitude == 0.0 { natural[family] } else { magnitude };
            let mut accepted = Flat::default();
            push(&mut accepted, magnitude + 0.5 * rel * scale);
            let report = cmp(&accepted).unwrap();
            if magnitude > 0.0 {
                let ordinary = dedaliano_engine::metamorphic::compare::compare(&accepted, &expected, l, rel).unwrap();
                assert_eq!(report.worst, ordinary.worst);
            }
            let mut rejected = Flat::default();
            push(&mut rejected, magnitude + 2.0 * rel * scale);
            assert!(cmp(&rejected).is_err(), "family {family}, magnitude {magnitude}");
        }
    }
}

#[test]
#[ignore = "known wrong result: #1088"]
fn issue_1088_pdelta_plane_convergence() {
    holds(1088, 20759, &[("P-Delta", "planes")]);
}

#[test]
#[ignore = "known wrong result: #1100"]
fn issue_1100_nonlinear_mirror_convergence() {
    holds(1100, 20759, &[("P-Delta", "mirror"), ("fiber nonlinear", "mirror")]);
}

#[test]
fn ground_action_scale_follows_units_and_excitation() {
    let Model::D3(c) = model(1206) else { panic!("3D") };
    let name = "time history (ground motion)";
    let cond = conditioning::of_3d(&c.s).unwrap();
    let force = crate::checks3::action_floor_3d(&c, name, cond.lchar);
    assert!(force > 0.0);
    for u in [Units::froude(10.0, 3.0), Units::froude(0.1, 0.5)] {
        let tc = c.units(&u);
        let other = conditioning::of_3d(&tc.s).unwrap();
        let scaled_force = crate::checks3::action_floor_3d(&tc, name, other.lchar);
        assert!((scaled_force / force - u.force).abs() < 64.0 * f64::EPSILON * u.force);
        let translation = force * cond.compliance()[0];
        let scaled_translation = scaled_force * other.compliance()[0];
        assert!((scaled_translation / translation - u.length).abs() < 64.0 * f64::EPSILON * u.length);
    }
    for row in ["linear", "time history", "spectral"] {
        assert_eq!(crate::checks3::action_floor_3d(&c, row, cond.lchar), crate::checks3::load_floor_3d(&c.s, cond.lchar));
    }
    let mut zero = c.clone();
    zero.p.ground = [0.0; 3];
    assert_eq!(crate::checks3::action_floor_3d(&zero, name, cond.lchar), 0.0);
    let mut heavier = c.clone();
    heavier.dens.values_mut().for_each(|d| *d *= 4.0);
    assert_eq!(crate::checks3::action_floor_3d(&heavier, name, cond.lchar), 4.0 * force);
}

#[test]
fn issue_1203_harmonic_symmetry() {
    let cells = replay(1203, 2026110201350, &[("harmonic", "symmetry")]);
    let c = cell(&cells, 1203, "harmonic", "symmetry");
    assert!(c.fails.is_empty(), "#1203: {c:?}");
    assert_eq!(c.inconclusive, 2, "#1203: {c:?}");
    assert_eq!(c.pass, 0, "#1203: uncertified symmetry passed: {c:?}");
}

#[test]
fn issue_1204_harmonic_symmetry() {
    let cells = replay(1204, 2026110201350, &[("harmonic", "symmetry")]);
    let c = cell(&cells, 1204, "harmonic", "symmetry");
    assert!(c.fails.is_empty(), "#1204: {c:?}");
    assert_eq!(c.inconclusive, 2, "#1204: {c:?}");
    assert_eq!(c.pass, 0, "#1204: uncertified symmetry passed: {c:?}");
}

#[test]
fn issue_1209_harmonic_symmetry() {
    let cells = replay(1209, 2026110205053, &[("harmonic", "symmetry")]);
    let c = cell(&cells, 1209, "harmonic", "symmetry");
    assert!(c.fails.is_empty(), "#1209: {c:?}");
    assert_eq!(c.inconclusive, 2, "#1209: {c:?}");
    assert_eq!(c.pass, 0, "#1209: uncertified symmetry passed: {c:?}");
}

#[test]
fn issue_1215_harmonic_symmetry() {
    let cells = replay(1215, 2026110201737, &[("harmonic", "symmetry")]);
    let c = cell(&cells, 1215, "harmonic", "symmetry");
    assert!(c.fails.is_empty(), "#1215: {c:?}");
    assert_eq!(c.inconclusive, 2, "#1215: {c:?}");
    assert_eq!(c.pass, 0, "#1215: uncertified symmetry passed: {c:?}");
}

#[test]
fn issue_1218_harmonic_symmetry() {
    let cells = replay(1218, 2026110200823, &[("harmonic", "symmetry")]);
    let c = cell(&cells, 1218, "harmonic", "symmetry");
    assert!(c.fails.is_empty(), "#1218: {c:?}");
    assert_eq!(c.pass, 2, "#1218: {c:?}");
    assert_eq!(c.inconclusive, 0, "#1218: {c:?}");
}

#[test]
fn issue_1278_harmonic_symmetry() {
    let cells = replay(1278, 2026110303012, &[("harmonic", "symmetry")]);
    let c = cell(&cells, 1278, "harmonic", "symmetry");
    assert!(c.fails.is_empty(), "#1278: {c:?}");
    assert_eq!(c.inconclusive, 2, "#1278: {c:?}");
    assert_eq!(c.pass, 0, "#1278: uncertified symmetry passed: {c:?}");
}

#[test]
fn issue_1281_harmonic_symmetry() {
    let cells = replay(1281, 2026110301259, &[("harmonic", "symmetry")]);
    let c = cell(&cells, 1281, "harmonic", "symmetry");
    assert!(c.fails.is_empty(), "#1281: {c:?}");
    assert_eq!(c.pass, 2, "#1281: {c:?}");
    assert_eq!(c.inconclusive, 0, "#1281: {c:?}");
}

#[test]
fn issue_1464_harmonic_symmetry() {
    let cells = replay(1464, 2026110500040, &[("harmonic", "symmetry")]);
    let c = cell(&cells, 1464, "harmonic", "symmetry");
    assert!(c.fails.is_empty(), "#1464: {c:?}");
    assert_eq!(c.pass, 2, "#1464: {c:?}");
    assert_eq!(c.inconclusive, 0, "#1464: {c:?}");
}

#[test]
fn issue_1030_spectral_symmetry() {
    let cells = replay(1030, 20758, &[("spectral", "symmetry")]);
    let c = cell(&cells, 1030, "spectral", "symmetry");
    assert!(c.fails.is_empty(), "#1030: {c:?}");
    assert_eq!(c.pass, 1, "#1030: {c:?}");
    assert_eq!(c.inconclusive, 0, "#1030: {c:?}");
}

#[test]
fn issue_1096_spectral_symmetry() {
    let cells = replay(1096, 20759, &[("spectral", "symmetry")]);
    let c = cell(&cells, 1096, "spectral", "symmetry");
    assert!(c.fails.is_empty(), "#1096: {c:?}");
    assert_eq!(c.pass, 1, "#1096: {c:?}");
    assert_eq!(c.inconclusive, 0, "#1096: {c:?}");
}

#[test]
fn issue_1214_spectral_symmetry() {
    let cells = replay(1214, 2026110200168, &[("spectral", "symmetry")]);
    let c = cell(&cells, 1214, "spectral", "symmetry");
    assert!(c.fails.is_empty(), "#1214: {c:?}");
    assert_eq!(c.pass, 1, "#1214: {c:?}");
    assert_eq!(c.inconclusive, 0, "#1214: {c:?}");
}

#[test]
fn issue_1220_spectral_symmetry() {
    let cells = replay(1220, 2026110201350, &[("spectral", "symmetry")]);
    let c = cell(&cells, 1220, "spectral", "symmetry");
    assert!(c.fails.is_empty(), "#1220: {c:?}");
    assert_eq!(c.pass, 1, "#1220: {c:?}");
    assert_eq!(c.inconclusive, 0, "#1220: {c:?}");
}

#[test]
fn harmonic_symmetry_at_seeded_resonances() {
    for issue in [1203, 1209, 1215, 1218, 1278, 1281, 1464] {
        for anti in [false, true] {
            let t = Tally::default();
            match model(issue) {
                Model::D2(c) => {
                    let mut sym = crate::symmetry::symmetrize_2d(&c.name, &c.s, anti).unwrap();
                    let md = dedaliano_engine::solver::modal::solve_modal_2d(&sym.case.s, &sym.case.dens, 12).unwrap();
                    sym.case.p.freqs = md.modes.iter().take(6).map(|m| m.frequency).collect();
                    crate::symmetry::check_2d(&t, &sym, anti, &[ana2("harmonic")]);
                }
                Model::D3(c) => {
                    let mut sym = crate::symmetry::symmetrize_3d(&c.name, &c.s, anti).unwrap();
                    let md = dedaliano_engine::solver::modal::solve_modal_3d(&sym.case.s, &sym.case.dens, 12).unwrap();
                    sym.case.p.freqs = md.modes.iter().take(6).map(|m| m.frequency).collect();
                    crate::symmetry::check_3d(&t, &sym, anti, &[ana3("harmonic")]);
                }
            }
            eprintln!("#{issue} anti={anti}: {}", t.report());
            assert!(t.failures().is_empty(), "#{issue}: {:?}", t.failures());
        }
    }
}

#[test]
fn harmonic_roundoff_floor_accounts_for_resonant_eigen_error() {
    let Model::D2(c) = model(1464) else { panic!("2D") };
    let mut c = crate::symmetry::symmetrize_2d(&c.name, &c.s, false).unwrap().case;
    let md = dedaliano_engine::solver::modal::solve_modal_2d(&c.s, &c.dens, 12).unwrap();
    c.p.freqs = vec![md.modes[0].frequency];
    let cond = crate::checks2::with_eigen_2d(conditioning::of_2d(&c.s).unwrap(), &c);
    let a = ana2("harmonic");
    let r = (a.run)(&c).unwrap();
    let l = crate::case::extent(c.s.nodes.values().map(|n| [n.x, n.z, 0.0]));
    let statics = dedaliano_engine::solver::linear::solve_2d(&c.s).unwrap();
    let us = statics.displacements.iter().fold(0.0f64, |m, d| m.max(d.ux.abs()).max(d.uz.abs()).max(d.ry.abs() * l));
    let gain = 1.0 / (2.0 * 0.05);
    let minimum = us * cond.eig * gain * gain;
    let budget = r.flat().t.floor * crate::checks2::rel_for(a.name, a.iter_tol, &cond);
    assert!(budget >= minimum, "eigen-resolvent error {minimum:e} exceeds harmonic budget {budget:e}");
}

#[test]
fn harmonic_symmetry_rejects_a_seeded_physical_scale_error() {
    let Model::D2(c) = model(1464) else { panic!("2D") };
    for anti in [false, true] {
        let sym = crate::symmetry::symmetrize_2d(&c.name, &c.s, anti).unwrap();
        let c = &sym.case;
        let a = ana2("harmonic");
        let cond = crate::checks2::with_eigen_2d(conditioning::of_2d(&c.s).unwrap(), c);
        let rel = crate::checks2::rel_for(a.name, a.iter_tol, &cond) * 2.0;
        let mut got = (a.run)(c).unwrap();
        let mut expected = got.iso2(&sym.iso).unwrap().relabel(&sym.pair).common(&got);
        if anti {
            expected.0.iter_mut().for_each(|i| i.v.iter_mut().for_each(|v| *v = -*v));
        }
        let cmp = |g: &Resp, e: &Resp| crate::checks2::judge_split(g, e, rel, rel, |g, e, rel| compare_with_compliance(&g.flat(), &e.flat(), cond.lchar, rel, crate::checks2::load_floor_2d(&c.s, cond.lchar), crate::checks2::compliance(a.name, &cond)));
        assert!(matches!(cmp(&got, &expected), Verdict::Pass(_)), "{:?}", cmp(&got, &expected));
        let statics = dedaliano_engine::solver::linear::solve_2d(&c.s).unwrap();
        let physical = statics.displacements.iter().fold(0.0f64, |m, d| m.max(d.ux.abs()).max(d.uz.abs()));
        assert!(physical > 0.0);
        let node = got.0[0].node;
        nudge(&mut got, "H_re1", node, usize::from(anti), physical);
        assert!(matches!(cmp(&got, &expected), Verdict::Fail(_)), "a physical displacement error passed: {:?}", cmp(&got, &expected));
    }
}

#[test]
fn harmonic_accuracy_floors_preserve_ordinary_response_ratios() {
    let Model::D2(c) = model(1464) else { panic!("2D") };
    let c = crate::symmetry::symmetrize_2d(&c.name, &c.s, false).unwrap().case;
    let a = ana2("harmonic");
    let cond = conditioning::of_2d(&c.s).unwrap();
    let rel = crate::checks2::rel_for(a.name, a.iter_tol, &cond) * 2.0;
    let mut expected = (a.run)(&c).unwrap();
    let scale = expected.flat().t.floor * 16.0;
    assert!(scale.is_finite() && scale > 0.0);
    expected.0[0].v[1] = scale;
    let mut got = expected.clone();
    got.0[0].v[0] += rel * scale * 0.5;
    let without_floors = |r: &Resp| {
        let mut r = r.clone();
        r.0.iter_mut().for_each(|i| i.floor = 0.0);
        r
    };
    let cmp = |g: &Resp, e: &Resp| compare_with_compliance(&g.flat(), &e.flat(), cond.lchar, rel, 0.0, [0.0, 0.0]);
    let ordinary = cmp(&without_floors(&got), &without_floors(&expected)).unwrap();
    assert_eq!(cmp(&got, &expected).unwrap().worst, ordinary.worst);
    got.0[0].v[0] += rel * scale * 2.0;
    assert!(cmp(&got, &expected).is_err());
    assert!(cmp(&without_floors(&got), &without_floors(&expected)).is_err());
}

#[test]
fn spectral_seeded_pair_magnitudes_reject_a_physical_scale_error() {
    let Model::D2(c) = model(1096) else { panic!("2D") };
    let sym = crate::symmetry::symmetrize_2d(&c.name, &c.s, false).unwrap();
    let c = &sym.case;
    let a = ana2("spectral");
    let cond = crate::checks2::with_eigen_2d(conditioning::of_2d(&c.s).unwrap(), c);
    let rel = crate::checks2::rel_for(a.name, a.iter_tol, &cond) * 2.0;
    let mut got = (a.run)(c).unwrap();
    let expected = got.iso2(&sym.iso).unwrap().relabel(&sym.pair).common(&got);
    let cmp = |g: &Resp| compare_with_compliance(&g.flat(), &expected.flat(), cond.lchar, rel, 0.0, [0.0, 0.0]);
    cmp(&got).unwrap();
    assert!(got.0.iter().filter(|i| i.tag == "u").flat_map(|i| &i.v).all(|v| *v >= 0.0));
    let physical = got.flat().t.maxabs();
    assert!(physical > 0.0);
    let node = got.0.iter().find(|i| i.tag == "u" && i.node != Some(1)).unwrap().node;
    nudge(&mut got, "u", node, 0, physical);
    assert!(cmp(&got).is_err(), "a peak magnitude wrong by the physical scale passed");
}

#[test]
fn spectral_truncation_keeps_overlapping_eigenvalue_error_intervals() {
    let w = vec![1.0, 2.0, 3.0, 4.0, 4.01, 6.0];
    let solve = |k: usize| -> Result<Vec<f64>, String> { Ok(w[..k.min(w.len())].to_vec()) };
    let (_, ordinary) = crate::ana2::cluster_complete(solve, Clone::clone, 4, 8, 0.0).unwrap();
    assert_eq!(ordinary, 4);
    let (_, bounded) = crate::ana2::cluster_complete(solve, Clone::clone, 4, 8, 0.05).unwrap();
    assert_eq!(bounded, 5);
    let accuracy = crate::dynamic_accuracy::Accuracy { lambda: w.iter().map(|w| w * w).collect(), residual: 0.05, natural: 1.0 };
    assert!(!accuracy.gap_error(4).is_finite());
    assert!(accuracy.gap_error(5).is_finite());
    assert_eq!(accuracy.gap_error(w.len()), 0.0);
}

#[test]
fn harmonic_3d_seeded_symmetry_rejects_a_physical_scale_error() {
    let Model::D3(c) = model(1218) else { panic!("3D") };
    let sym = crate::symmetry::symmetrize_3d(&c.name, &c.s, false).unwrap();
    let c = &sym.case;
    let a = ana3("harmonic");
    let cond = crate::checks3::with_eigen_3d(conditioning::of_3d(&c.s).unwrap(), c);
    let rel = crate::checks2::rel_for(a.name, a.iter_tol, &cond) * 2.0;
    let mut got = (a.run)(c).unwrap();
    let expected = got.iso3(&sym.iso).unwrap().relabel(&sym.pair).common(&got);
    let cmp = |g: &Resp| crate::checks2::judge_split(g, &expected, rel, rel, |g, e, rel| compare_with_compliance(&g.flat(), &e.flat(), cond.lchar, rel, crate::checks3::load_floor_3d(&c.s, cond.lchar), crate::checks2::compliance(a.name, &cond)));
    assert!(matches!(cmp(&got), Verdict::Pass(_)), "{:?}", cmp(&got));
    let statics = dedaliano_engine::solver::linear::solve_3d(&c.s).unwrap();
    let physical = statics.displacements.iter().fold(0.0f64, |m, d| m.max(d.ux.abs()).max(d.uy.abs()).max(d.uz.abs()));
    assert!(physical > 0.0);
    let node = got.0[0].node;
    nudge(&mut got, "H_re1", node, 0, physical);
    assert!(matches!(cmp(&got), Verdict::Fail(_)), "a physical 3D displacement error passed: {:?}", cmp(&got));
}

#[test]
fn unresolved_harmonic_accuracy_is_inconclusive() {
    let Model::D2(c) = model(1278) else { panic!("2D") };
    let sym = crate::symmetry::symmetrize_2d(&c.name, &c.s, false).unwrap();
    let a = ana2("harmonic");
    let got = (a.run)(&sym.case).unwrap();
    let cond = conditioning::of_2d(&sym.case.s).unwrap();
    let rel = crate::checks2::rel_for(a.name, a.iter_tol, &cond) * 2.0;
    let judge = |g: &Resp| crate::checks2::judge_split(g, &got, rel, rel, |g, e, rel| compare_with_compliance(&g.flat(), &e.flat(), cond.lchar, rel, 0.0, [0.0, 0.0]));
    assert!(matches!(judge(&got), Verdict::Inconclusive(_)));
    let mut wrong = got.clone();
    wrong.0[0].v[0] += 1.0;
    assert!(matches!(judge(&wrong), Verdict::Inconclusive(_)), "an uncertified response must never pass");
}

#[test]
fn spectral_peak_symmetry_uses_magnitudes_for_both_combination_rules() {
    use crate::response::{Dim, Kind};
    use dedaliano_engine::types::*;
    let Model::D2(c) = model(1096) else { panic!("2D") };
    let sym = crate::symmetry::symmetrize_2d(&c.name, &c.s, false).unwrap();
    let c = &sym.case;
    let md = dedaliano_engine::solver::modal::solve_modal_2d(&c.s, &c.dens, 12).unwrap();
    let cond = crate::checks2::with_eigen_2d(conditioning::of_2d(&c.s).unwrap(), c);
    let rel = crate::checks2::rel_for("spectral", 1e-10, &cond) * 2.0;
    for rule in ["SRSS", "CQC"] {
        let input = SpectralInput {
            solver: c.s.clone(), densities: c.dens.clone(),
            modes: md.modes.iter().map(|m| SpectralModeInput {
                frequency: m.frequency, period: m.period, omega: m.omega,
                displacements: m.displacements.iter().map(|d| SpectralModeDisp { node_id: d.node_id, ux: d.ux, uz: d.uz, ry: d.ry }).collect(),
                participation_x: m.participation_x, participation_y: m.participation_y,
                effective_mass_x: m.effective_mass_x, effective_mass_y: m.effective_mass_y,
            }).collect(),
            spectrum: DesignSpectrum { name: "seeded".into(), points: vec![SpectrumPoint { period: 0.0, sa: 0.2 }, SpectrumPoint { period: 4.0, sa: 0.12 }], in_g: Some(true) },
            direction: "X".into(), rule: Some(rule.into()), xi: Some(0.05), importance_factor: None, reduction_factor: None, total_mass: None,
        };
        let r = dedaliano_engine::solver::spectral::solve_spectral_2d(&input).unwrap();
        let mut got = Resp::default();
        for d in r.displacements {
            assert!(d.ux >= 0.0 && d.uz >= 0.0, "{rule}: a peak was signed");
            got.push(Some(d.node_id), None, "u", Kind::Abs2(Dim::LEN), vec![d.ux, d.uz]);
        }
        let expected = got.iso2(&sym.iso).unwrap().relabel(&sym.pair).common(&got);
        let cmp = |g: &Resp| compare_with_compliance(&g.flat(), &expected.flat(), cond.lchar, rel, 0.0, [0.0, 0.0]);
        cmp(&got).unwrap();
        let physical = got.flat().t.maxabs();
        assert!(physical > 0.0);
        let node = got.0.iter().find(|i| i.node != Some(1)).unwrap().node;
        nudge(&mut got, "u", node, 0, physical);
        assert!(cmp(&got).is_err(), "{rule}: a wrong peak magnitude passed");
    }
}

#[test]
fn harmonic_error_does_not_certify_an_uncertain_damping_anchor_selection() {
    let accuracy = crate::dynamic_accuracy::Accuracy { lambda: vec![1e-10, 1.0, 2.0], residual: 1e-15, natural: 1.0 };
    let damping = dedaliano_engine::solver::damping::rayleigh_coefficients(1.0, 2.0f64.sqrt(), 0.05);
    assert!(!accuracy.harmonic_error(1.0, damping, 0.0).is_finite());
}
