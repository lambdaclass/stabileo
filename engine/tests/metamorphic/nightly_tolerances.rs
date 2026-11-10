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
fn issue_1094_analysis_accuracy() {
    holds(1094, 2026110203181, &[("linear (PCG)", "units")]);
}

#[test]
fn issue_1211_analysis_accuracy() {
    holds(1211, 2026110205346, &[("linear (PCG)", "symmetry")]);
}

#[test]
fn issue_1369_analysis_accuracy() {
    holds(1369, 2026110406225, &[("time history", "symmetry")]);
}

#[test]
fn issue_1370_analysis_accuracy() {
    holds(1370, 2026110406225, &[("time history", "symmetry")]);
}

#[test]
fn issue_1650_analysis_accuracy() {
    holds(1650, 2026110706031, &[("harmonic", "reciprocity")]);
}

#[test]
fn issue_1652_analysis_accuracy() {
    holds(1652, 2026110702242, &[("moving loads", "reversal")]);
}

#[test]
fn issue_1763_analysis_accuracy() {
    holds(1763, 2026110805292, &[("buckling", "planes"), ("buckling", "mirror"), ("buckling", "relabel"), ("buckling", "rotation"), ("buckling", "units")]);
}

#[test]
fn issue_1765_analysis_accuracy() {
    holds(1765, 2026110801842, &[("linear (PCG)", "reciprocity")]);
}

#[test]
#[ignore]
fn analysis_accuracy_200_seed_sweep() {
    let names = ["linear (PCG)", "time history", "harmonic", "moving loads", "buckling"];
    let a2: Vec<_> = crate::ana2::rows().into_iter().filter(|a| names.contains(&a.name)).collect();
    let a3: Vec<_> = crate::ana3::rows().into_iter().filter(|a| names.contains(&a.name)).collect();
    let mut output = Vec::new();
    for k in 0..200 {
        let seed = 2026110200000 + k;
        let t2 = Tally::default();
        let t3 = Tally::default();
        let c2 = crate::corpus::fuzz_case_2d(2026110200000, k);
        let c3 = crate::corpus::fuzz_case_3d(2026110200000, k);
        crate::checks2::check_case(&crate::checks2::Ctx { tally: &t2, rng_seed: seed }, &c2, &a2, crate::INV_2D);
        crate::checks3::check_case(&crate::checks3::Ctx { tally: &t3, rng_seed: seed }, &c3, &a3, crate::INV_3D);
        for anti in [false, true] {
            if let Some(sym) = crate::symmetry::symmetrize_2d(&c2.name, &c2.s, anti) {
                crate::symmetry::check_2d(&t2, &sym, anti, &a2);
            }
            if let Some(sym) = crate::symmetry::symmetrize_3d(&c3.name, &c3.s, anti) {
                crate::symmetry::check_3d(&t3, &sym, anti, &a3);
            }
        }
        if let Ok(dir) = std::env::var("ANALYSIS_ACCURACY_REPRODUCERS") {
            std::fs::create_dir_all(&dir).unwrap();
            for (dim, t, mut model) in [("2d", &t2, serde_json::to_value(&c2.s).unwrap()), ("3d", &t3, serde_json::to_value(&c3.s).unwrap())] {
                if t.failures().is_empty() { continue; }
                let (name, dens) = if dim == "2d" { (&c2.name, &c2.dens) } else { (&c3.name, &c3.dens) };
                model["_nightly_name"] = serde_json::json!(name);
                model["_nightly_dens"] = serde_json::json!(dens);
                std::fs::write(format!("{dir}/seed-{seed}-{dim}.json"), serde_json::to_vec_pretty(&model).unwrap()).unwrap();
            }
        }
        assert_retained_analysis_failures(seed, "d2", &t2);
        assert_retained_analysis_failures(seed, "d3", &t3);
        output.push(serde_json::json!({"seed": seed, "d2": t2.replay_results(), "d3": t3.replay_results()}));
    }
    if let Ok(path) = std::env::var("ANALYSIS_ACCURACY_SWEEP") {
        std::fs::write(path, serde_json::to_vec_pretty(&output).unwrap()).unwrap();
    }
    let moving_3d = analysis_accuracy_moving_3d_coverage();
    if let Ok(path) = std::env::var("ANALYSIS_ACCURACY_MOVING_COVERAGE") {
        std::fs::write(path, serde_json::to_vec_pretty(&moving_3d).unwrap()).unwrap();
    }
    let baseline: serde_json::Value = serde_json::from_str(include_str!("../metamorphic_corpus/nightly/analysis-accuracy-coverage.json")).unwrap();
    for dim in ["d2", "d3"] {
        let mut counts = std::collections::BTreeMap::<String, std::collections::BTreeMap<String, u64>>::new();
        for row in output.iter().flat_map(|v| v[dim]["verdicts"].as_array().unwrap()) {
            let key = format!("{} / {}", row["analysis"].as_str().unwrap(), row["invariant"].as_str().unwrap());
            let c = counts.entry(key).or_default();
            *c.entry("compared".into()).or_default() += row["pass"].as_u64().unwrap() + row["fail"].as_u64().unwrap() + row["inconclusive"].as_u64().unwrap();
            for field in ["inconclusive", "refused", "same_refusal", "unrepresentable", "not_applicable"] {
                *c.entry(field.into()).or_default() += row[field].as_u64().unwrap();
            }
        }
        assert_eq!(serde_json::to_value(counts).unwrap(), baseline[dim], "{dim}: the 200-seed coverage fraction changed");
        let sum = |key: &str| output.iter().flat_map(|v| v[dim]["verdicts"].as_array().unwrap()).map(|c| c[key].as_u64().unwrap()).sum::<u64>();
        eprintln!("{dim}: pass={} fail={} refused={} inconclusive={}", sum("pass"), sum("fail"), sum("refused"), sum("inconclusive"));
    }
}

#[test]
fn analysis_accuracy_certificates_cover_the_published_models() {
    let Model::D2(pc) = model(1765) else { panic!("2D") };
    let pr = (ana2("linear (PCG)").run)(&pc).unwrap();
    assert!(pr.0.iter().any(|i| i.tag == "ry" && i.error > 0.0));

    let Model::D2(c) = model(1652) else { panic!("2D") };
    let input = dedaliano_engine::types::MovingLoadInput {
        solver: c.s.clone(),
        train: dedaliano_engine::types::LoadTrain { name: "two axles".into(), axles: vec![dedaliano_engine::types::Axle { offset: 0.0, weight: c.p.axle }, dedaliano_engine::types::Axle { offset: 3.0 * c.p.step, weight: 0.5 * c.p.axle }] },
        step: Some(c.p.step), path_element_ids: c.path.clone(),
    };
    let env = dedaliano_engine::solver::moving_loads::solve_moving_loads_2d(&input).unwrap();
    let mut r = (ana2("moving loads").run)(&c).unwrap();
    crate::analysis_accuracy::moving_2d(&c, &env, &mut r).unwrap();
    assert!(r.0.iter().filter(|i| i.tag == "M").all(|i| i.error > 0.0 && i.error.is_finite()));
    let Model::D2(c) = model(1763) else { panic!("2D") };
    let mut r = (ana2("buckling").run)(&c).unwrap();
    crate::analysis_accuracy::buckling_2d(&c, &mut r).unwrap();
    assert!(r.0.iter().all(|i| i.error > 0.0 && i.error.is_finite()));
}

#[test]
fn analysis_accuracy_planted_errors_still_fail() {
    for (issue, name, tag, relative_error) in [(1765, "linear (PCG)", "ry", 1e-6), (1652, "moving loads", "M", 1e-6), (1763, "buckling", "lambda2", 1e-3)] {
        let Model::D2(c) = model(issue) else { panic!("2D") };
        let a = ana2(name);
        let cond = crate::checks2::with_eigen_2d(conditioning::of_2d(&c.s).unwrap(), &c);
        let rel = crate::checks2::rel_for(name, a.iter_tol, &cond);
        let expected = (a.run)(&c).unwrap();
        let mut got = expected.clone();
        let floor = crate::checks2::load_floor_2d(&c.s, cond.lchar);
        let cmp = |g: &Resp| crate::analysis_accuracy::compare(g, &expected, cond.lchar, rel, floor, crate::checks2::compliance(name, &cond));
        cmp(&got).unwrap();
        let it = got.0.iter_mut().find(|i| i.tag == tag && i.v.iter().any(|v| *v != 0.0)).unwrap();
        let natural = if tag == "ry" { expected.flat().r.maxabs().max(expected.flat().t.maxabs() / cond.lchar).max(floor * cond.lchar * cond.compliance()[1]) }
            else { it.v.iter().fold(it.floor, |s, v| s.max(v.abs())) };
        let change = relative_error * natural;
        it.v[0] += change;
        assert!(cmp(&got).is_err(), "#{issue}: planted {change:e} ({relative_error:e} of {natural:e}) passed");
    }
    let Model::D3(c) = model(1650) else { panic!("3D") };
    let a = ana3("harmonic");
    let cond = conditioning::of_3d(&c.s).unwrap();
    let rel = crate::checks2::rel_for(a.name, a.iter_tol, &cond);
    let expected = (a.run)(&c).unwrap();
    let mut got = expected.clone();
    let natural = dedaliano_engine::solver::linear::solve_3d(&c.s).unwrap().displacements.iter().flat_map(|d| [d.ux.abs(), d.uy.abs(), d.uz.abs()]).fold(0.0, f64::max);
    let node = got.0.iter().find(|i| i.tag == "H_re0").unwrap().node;
    nudge(&mut got, "H_re0", node, 0, 1e-3 * natural);
    assert!(crate::analysis_accuracy::compare(&got, &expected, cond.lchar, rel, crate::checks3::action_floor_3d(&c, a.name, cond.lchar), crate::checks2::compliance(a.name, &cond)).is_err());
}

#[test]
fn analysis_accuracy_ordinary_response_ratio_is_unchanged() {
    use crate::response::{Dim, Kind};
    for kind in [Kind::V2(Dim::LEN), Kind::P2(Dim::NONE), Kind::Local(Dim::NONE, false), Kind::Pair(Dim::MOMENT, false)] {
        let mut expected = Resp::default();
        let n = if matches!(kind, Kind::V2(_) | Kind::Pair(..)) { 2 } else { 1 };
        expected.push(None, None, "ordinary", kind, vec![1e6; n]);
        expected.0[0].error = 1e-8;
        let mut got = expected.clone();
        got.0[0].v[0] += 1e-4;
        let legacy = compare_with_compliance(&got.flat(), &expected.flat(), 1.0, 1e-9, 0.0, [0.0; 2]).unwrap();
        let bounded = crate::analysis_accuracy::compare(&got, &expected, 1.0, 1e-9, 0.0, [0.0; 2]).unwrap();
        assert_eq!(legacy.worst.to_bits(), bounded.worst.to_bits());
        got.0[0].v[0] += 1.0;
        assert!(crate::analysis_accuracy::compare(&got, &expected, 1.0, 1e-9, 0.0, [0.0; 2]).is_err());
        got.0[0].error = f64::INFINITY;
        assert!(crate::analysis_accuracy::compare(&got, &expected, 1.0, 1e-9, 0.0, [0.0; 2]).is_err());
    }
}

#[test]
fn analysis_accuracy_time_history_plant_is_rejected() {
    let Model::D3(c) = model(1369) else { panic!("3D") };
    let a = ana3("time history");
    let cond = crate::checks3::with_eigen_3d(conditioning::of_3d(&c.s).unwrap(), &c);
    let rel = crate::checks2::rel_for(a.name, a.iter_tol, &cond);
    let expected = (a.run)(&c).unwrap();
    assert!(expected.0.iter().any(|i| i.error > 0.0));
    let mut got = expected.clone();
    let floor = crate::checks3::action_floor_3d(&c, a.name, cond.lchar);
    let natural = expected.flat().r.maxabs().max(expected.flat().t.maxabs() / cond.lchar).max(floor * cond.lchar * cond.compliance()[1]);
    let node = got.0.iter().find(|i| i.tag == "r_t060" && i.v.iter().any(|v| *v != 0.0)).unwrap().node;
    nudge(&mut got, "r_t060", node, 0, 1e-6 * natural);
    let verdict = crate::analysis_accuracy::compare(&got, &expected, cond.lchar, rel, floor, crate::checks2::compliance(a.name, &cond));
    assert!(verdict.is_err(), "rel={rel:e}, natural={natural:e}, largest bound={:e}, report={verdict:?}, legacy={:?}", expected.0.iter().map(|i| i.error).fold(0.0, f64::max), compare_with_compliance(&got.flat(), &expected.flat(), cond.lchar, rel, floor, crate::checks2::compliance(a.name, &cond)));
}

fn unit_stiffness_case(three: bool) -> serde_json::Value {
    let mut v = serde_json::json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 1.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": 1.0, "nu": 0.0}},
        "sections": {"1": {"id": 1, "a": 1.0, "iz": 1.0}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}, "2": {"id": 2, "nodeId": 2, "type": "roller_x"}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 1.0, "fz": 0.0, "my": 0.0}}]
    });
    if three {
        for n in v["nodes"].as_object_mut().unwrap().values_mut() { n["y"] = 0.0.into(); }
        v["sections"]["1"]["iy"] = 1.0.into();
        v["sections"]["1"]["j"] = 1.0.into();
        for id in ["1", "2"] {
            v["supports"][id] = serde_json::json!({"nodeId": id.parse::<usize>().unwrap(), "rx": id == "1", "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true});
        }
        for key in ["fy", "mx", "mz"] { v["loads"][0]["data"][key] = 0.0.into(); }
    } else {
        v["supports"]["2"] = serde_json::json!({"id": 2, "nodeId": 2, "type": "spring", "kz": 1.0, "ky": 1.0});
    }
    v
}

#[test]
fn analysis_accuracy_zeroed_pcg_2d_before_certification_is_rejected() {
    let c = Case2::new("unit stiffness", serde_json::from_value(unit_stiffness_case(false)).unwrap());
    let expected = crate::response::static_2d(&dedaliano_engine::solver::linear::solve_2d(&c.s).unwrap());
    let mut got = expected.clone();
    for i in got.0.iter_mut().filter(|i| i.tag == "u" || i.tag == "ry") { i.v.fill(0.0); }
    crate::analysis_accuracy::attach(&mut got, |r| crate::analysis_accuracy::pcg_2d(&c, r));
    assert!(crate::analysis_accuracy::compare(&got, &expected, 1.0, 1e-10, 0.0, [0.0; 2]).is_err());
}

#[test]
fn analysis_accuracy_zeroed_pcg_3d_before_certification_is_rejected() {
    let c = Case3::new("unit stiffness", serde_json::from_value(unit_stiffness_case(true)).unwrap());
    let expected = crate::response::static_3d(&dedaliano_engine::solver::linear::solve_3d(&c.s).unwrap());
    let mut got = expected.clone();
    for i in got.0.iter_mut().filter(|i| i.tag == "u" || i.tag == "r") { i.v.fill(0.0); }
    crate::analysis_accuracy::attach(&mut got, |r| crate::analysis_accuracy::pcg_3d(&c, r));
    assert!(crate::analysis_accuracy::compare(&got, &expected, 1.0, 1e-10, 0.0, [0.0; 2]).is_err());
}

fn retained_analysis_failures(seed: u64, dim: &str) -> Vec<(&'static str, &'static str)> {
    match (seed, dim) {
        (2026110200030, "d2") => vec![("harmonic", "relabel"), ("harmonic", "units")],
        (2026110200045, "d3") | (2026110200167 | 2026110200176, "d2") => vec![("harmonic", "units")],
        (2026110200115, "d3") => vec![("linear (PCG)", "units")],
        (2026110200131, "d3") => ["harmonic", "time history"].into_iter().flat_map(|a| ["relabel", "rotation", "units"].map(|i| (a, i))).collect(),
        _ => vec![],
    }
}

fn assert_retained_analysis_failures(seed: u64, dim: &str, t: &Tally) {
    let cells = t.cells.lock().unwrap();
    for (a, i) in retained_analysis_failures(seed, dim) {
        let c = cell(&cells, 1892, a, i);
        assert!(!c.fails.is_empty(), "{seed} {dim}: {a} / {i} stopped flagging the retained failure: {c:?}");
        assert_eq!(c.pass, 0, "{seed} {dim}: {a} / {i} silently passed");
    }
}

#[test]
fn analysis_accuracy_retained_wrong_result_cells_stay_failures() {
    for (seed, dim) in [(2026110200030, "d2"), (2026110200045, "d3"), (2026110200115, "d3"), (2026110200131, "d3"), (2026110200167, "d2"), (2026110200176, "d2")] {
        let t = Tally::default();
        let cells = retained_analysis_failures(seed, dim);
        let names: Vec<_> = cells.iter().map(|c| c.0).collect();
        if dim == "d2" {
            let c = crate::corpus::fuzz_case_2d(2026110200000, seed - 2026110200000);
            let anas: Vec<_> = crate::ana2::rows().into_iter().filter(|a| names.contains(&a.name)).collect();
            crate::checks2::check_case(&crate::checks2::Ctx { tally: &t, rng_seed: seed }, &c, &anas, crate::INV_2D);
        } else {
            let c = crate::corpus::fuzz_case_3d(2026110200000, seed - 2026110200000);
            let anas: Vec<_> = crate::ana3::rows().into_iter().filter(|a| names.contains(&a.name)).collect();
            crate::checks3::check_case(&crate::checks3::Ctx { tally: &t, rng_seed: seed }, &c, &anas, crate::INV_3D);
        }
        assert_retained_analysis_failures(seed, dim, &t);
    }
}

fn moving_deck_3d() -> Case3 {
    Case3::new("moving deck", serde_json::from_str(include_str!("../fixtures/ex-3d-torsion-beam-input.json")).unwrap())
}

fn analysis_accuracy_moving_3d_coverage() -> serde_json::Value {
    let t = Tally::default();
    let c = moving_deck_3d();
    for u in [Units::froude(1.0, 1.0), Units::froude(0.3048, 4.448)] {
        crate::checks3::check_case(&crate::checks3::Ctx { tally: &t, rng_seed: 2026110200000 }, &c.units(&u), &[ana3("moving loads")], &["relabel", "units", "reversal"]);
    }
    for inv in ["relabel", "units", "reversal"] {
        let cells = t.cells.lock().unwrap();
        let c = cell(&cells, 1892, "moving loads", inv);
        assert!(c.pass > 0 && c.fails.is_empty(), "3D moving loads / {inv}: {c:?}");
    }
    t.replay_results()
}

#[test]
fn analysis_accuracy_moving_3d_compares_transforms_and_rejects_a_plant() {
    analysis_accuracy_moving_3d_coverage();
    let c = moving_deck_3d();
    let a = ana3("moving loads");
    let u = Units::froude(0.3048, 4.448);
    let tc = c.units(&u);
    let cond = conditioning::of_3d(&c.s).unwrap().worst(&conditioning::of_3d(&tc.s).unwrap());
    let rel = crate::checks2::rel_for(a.name, a.iter_tol, &cond);
    let expected = (a.run)(&c).unwrap().units(&u);
    let mut got = (a.run)(&tc).unwrap();
    assert!(got.0.iter().any(|i| i.error > 0.0 && i.error.is_finite()));
    let cmp = |r: &Resp| crate::analysis_accuracy::compare(r, &expected, cond.lchar, rel, crate::checks3::load_floor_3d(&tc.s, cond.lchar), cond.compliance());
    cmp(&got).unwrap();
    let it = got.0.iter_mut().find(|i| i.tag == "My" && i.v.iter().any(|v| *v != 0.0)).unwrap();
    let natural = it.v.iter().fold(it.floor, |m, v| m.max(v.abs()));
    it.v[0] += 1e-6 * natural;
    assert!(cmp(&got).is_err());
}
