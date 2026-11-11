use super::*;
use crate::response::{self, Dim, Kind, Resp};
use dedaliano_engine::{solver::{dof::DofNumbering, linear}, types::*};

#[derive(Clone)]
enum Change { Original, Units(Units), Iso2(Iso2), Iso3(Iso3), Mirror(usize), Relabel(Relabel) }

impl Change {
    fn response(&self, r: &Resp, inverse: bool) -> Resp {
        match self {
            Self::Original => r.clone(),
            Self::Units(u) => r.units(&if inverse { Units { length: 1.0/u.length, force: 1.0/u.force, time: 1.0/u.time } } else { *u }),
            Self::Iso2(iso) => r.iso2(&if inverse { Iso2 { q: [[iso.q[0][0], iso.q[1][0]], [iso.q[0][1], iso.q[1][1]]], t: [0.0; 2] } } else { iso.clone() }).unwrap(),
            Self::Iso3(iso) => r.iso3(&if inverse { Iso3 { r: dedaliano_engine::metamorphic::transform::mat3_t(&iso.r), t: [0.0; 3] } } else { iso.clone() }).unwrap(),
            Self::Mirror(axis) => {
                let mut regular = r.clone();
                regular.0.retain(|i| i.tag != "warping" && i.tag != "bimoment");
                let mut mirrored = regular.mirror3(*axis).unwrap();
                for i in r.0.iter().filter(|i| i.tag == "warping" || i.tag == "bimoment") {
                    let mut i = i.clone();
                    for v in &mut i.v { *v = -*v; }
                    mirrored.0.push(i);
                }
                mirrored
            },
            Self::Relabel(rl) => r.relabel(&if inverse {
                Relabel { node: rl.node.iter().map(|(&a, &b)| (b, a)).collect(), element: rl.element.iter().map(|(&a, &b)| (b, a)).collect(), ..Default::default() }
            } else { rl.clone() }),
        }
    }
}

fn loaded(m: Model) -> Model {
    match m {
        Model::D2(mut s) => {
            let dof = DofNumbering::build_2d(&s);
            for (i, ((node, local), _)) in dof.entries_by_dof().into_iter().take(dof.n_free).enumerate() {
                if local >= 2 { continue; }
                let mut load = serde_json::json!({"type":"nodal","data":{"nodeId":node,"fx":0.0,"fz":0.0,"my":0.0}});
                load["data"][if local == 0 { "fx" } else { "fz" }] = serde_json::json!((i+1) as f64 * 1e-6);
                s.loads.push(serde_json::from_value(load).unwrap());
            }
            Model::D2(s)
        },
        Model::D3(mut s) => {
            let dof = DofNumbering::build_3d(&s);
            for (i, ((node, local), _)) in dof.entries_by_dof().into_iter().take(dof.n_free).enumerate() {
                if local >= 3 { continue; }
                let mut load = serde_json::json!({"type":"nodal","data":{"nodeId":node,"fx":0.0,"fy":0.0,"fz":0.0,"mx":0.0,"my":0.0,"mz":0.0}});
                load["data"][["fx","fy","fz"][local]] = serde_json::json!((i+1) as f64 * 1e-6);
                s.loads.push(serde_json::from_value(load).unwrap());
            }
            Model::D3(s)
        },
    }
}

fn solve(m: &Model) -> Result<Resp, String> {
    match m {
        Model::D2(s) => linear::solve_2d(s).map(|r| response::static_2d(&r)),
        Model::D3(s) => linear::solve_3d(s).map(|r| {
            let mut out = response::static_3d(&r);
            for d in &r.displacements {
                if let Some(w) = d.warping { out.push(Some(d.node_id), None, "warping", Kind::Local(Dim(-1, 0, 0), false), vec![w]); }
            }
            for f in &r.element_forces {
                if let (Some(a), Some(b)) = (f.bimoment_start, f.bimoment_end) { out.push(None, Some(f.element_id), "bimoment", Kind::Local(Dim(2, 1, 0), false), vec![a, b]); }
            }
            out
        }),
    }
}

fn copies(name: &str, m: &Model) -> Vec<(String, Result<Model, String>, Change)> {
    let seed = name.bytes().fold(20261108u64, |h, b| h.wrapping_mul(31).wrapping_add(b as u64));
    let mut rng = Rng::new(seed);
    let mut changes: Vec<_> = UNITS.iter().map(|&(l, f)| Change::Units(Units::froude(l, f))).collect();
    let copies = match m {
        Model::D2(s) => {
            let c = Case2::new(name, s.clone());
            for k in 0..3 {
                changes.push(Change::Iso2(Iso2::rotation(rng.range(0.1, 6.2)).translated(rng.range(-50.0, 50.0), rng.range(-50.0, 50.0))));
                changes.push(Change::Iso2(Iso2::rotation(std::f64::consts::FRAC_PI_2 * (1+k) as f64)));
                changes.push(Change::Iso2(Iso2::mirror_line(rng.range(0.0, 3.1)).translated(rng.range(-50.0, 50.0), rng.range(-50.0, 50.0))));
            }
            changes.push(Change::Iso2(Iso2::mirror_x()));
            for k in 0..4 { changes.push(Change::Relabel(Relabel::random_2d(&c.s, seed+k))); }
            transforms_2d(&c, seed).into_iter().map(|(w,c)| (w,c.map(|c| Model::D2(c.s)))).collect::<Vec<_>>()
        },
        Model::D3(s) => {
            let c = Case3::new(name, s.clone());
            for k in 0..3 {
                changes.push(Change::Iso3(Iso3::random(&mut rng).translated([rng.range(-50.0,50.0),rng.range(-50.0,50.0),rng.range(-50.0,50.0)])));
                changes.push(Change::Iso3(Iso3::axis_permutation(3+5*k)));
                let _translation = rng.range(-50.0,50.0);
                changes.push(Change::Mirror(k));
            }
            for k in 0..4 { changes.push(Change::Relabel(Relabel::random_3d(&c.s, seed+k))); }
            transforms_3d(&c, seed).into_iter().map(|(w,c)| (w,c.map(|c| Model::D3(c.s)))).collect::<Vec<_>>()
        },
    };
    assert_eq!(copies.len(), changes.len());
    std::iter::once(("original".to_string(), Ok(match m { Model::D2(s) => Model::D2(s.clone()), Model::D3(s) => Model::D3(s.clone()) }), Change::Original))
        .chain(copies.into_iter().zip(changes).map(|((name,m),change)| (name,m,change))).collect()
}

fn reference(v: &serde_json::Value, two_d: bool) -> Resp {
    let mut out = Resp::default();
    for i in v["items"].as_array().unwrap() {
        let tag = i["tag"].as_str().unwrap();
        let dim = match tag { "u" => Dim::LEN, "r" | "ry" => Dim::NONE, "R" | "N" | "V" => Dim::FORCE, "warping" => Dim(-1,0,0), "bimoment" => Dim(2,1,0), _ => Dim::MOMENT };
        let kind = match tag {
            "u" | "R" => if two_d { Kind::V2(dim) } else { Kind::V3(dim) },
            "r" | "RM" if !two_d => Kind::V3(dim),
            "ry" | "RM" => Kind::P2(dim),
            _ => Kind::Local(dim, two_d && (tag == "V" || tag == "M")),
        };
        out.push(i["node"].as_u64().map(|v| v as usize), i["element"].as_u64().map(|v| v as usize), tag, kind,
            i["values"].as_array().unwrap().iter().map(|v| v.as_str().unwrap().parse().unwrap()).collect());
    }
    out
}

fn compare(a: &Resp, b: &Resp, reference: &Resp, force: f64, length: f64) -> f64 {
    let key = |i: &response::Item| (i.node, i.elem, i.tag.clone());
    let b: std::collections::BTreeMap<_,_> = b.0.iter().map(|i| (key(i), i)).collect();
    assert_eq!(a.0.len(), b.len());
    let mut worst = 0.0f64;
    let translation = reference.0.iter().filter(|i| i.tag == "u").flat_map(|i| &i.v).fold(0.0f64, |a,b| a.max(b.abs()));
    for i in &a.0 {
        let j = b.get(&key(i)).unwrap_or_else(|| panic!("missing {:?}", key(i)));
        assert_eq!(i.v.len(), j.v.len());
        let floor = match i.tag.as_str() {
            "u" => translation, "r" | "ry" => translation/length, "warping" => translation/(length*length),
            "N" | "V" | "R" => force, "bimoment" => force*length*length, _ => force*length,
        };
        let scale = reference.0.iter().filter(|j| j.tag == i.tag).flat_map(|j| &j.v).fold(floor, |a,b| a.max(b.abs()));
        for (&v, &w) in i.v.iter().zip(&j.v) {
            assert!(v.is_finite() && w.is_finite());
            let error = if scale == 0.0 { (v-w).abs() } else { (v-w).abs()/scale };
            worst = worst.max(error);
            assert!(error <= stability::CONDITIONAL_ACCURACY, "{:?}: {v:.16e} vs {w:.16e}, scale {scale:.16e}, relative {error:.16e}", key(i));
        }
    }
    worst
}

fn expected_refusal(name: &str, e: &str) -> bool {
    let conditioning = e.starts_with("the structure is a mechanism or so close to one")
        && e.contains("the matrix exceeds a conditioning limit or the recovered response fails its accuracy check");
    let mechanism = e.starts_with("the structure is a mechanism at nodes ")
        && e.contains("a node can move freely in a direction no member, support or spring stiffens");
    let factorization_accuracy = e == "the structure cannot be solved reliably: stiffness factorization accuracy is unresolved after the stability check; no result is returned";
    match name {
        "issue-1029" | "issue-973" => conditioning || factorization_accuracy,
        "issue-1083" | "issue-1091" | "issue-1353" | "issue-1355" | "issue-1362" => conditioning,
        "issue-1008" | "issue-1095" | "issue-1103" | "issue-1112" | "issue-1359" | "issue-1648" | "issue-1651" | "issue-964" | "issue-966" | "issue-967" => mechanism,
        "issue-1028" => serde_json::from_str::<serde_json::Value>(e).ok().is_some_and(|v| {
            v["structuredDiagnostics"].as_array().is_some_and(|ds| ds.iter().any(|d| d["code"] == "conflicting_support_spring" && d["severity"] == "error"))
        }),
        "issue-1099" => e.starts_with("Connector ") && e.contains("needs rotation DOFs to carry its moment V·L"),
        "issue-1106" => e.starts_with("Nodal moment at node ") && e.contains("is not supported: no member, support or spring stiffens that rotation"),
        _ => false,
    }
}

const SOLVABLE: &[(&str, usize)] = &[
    ("issue-1086", 19), ("issue-1090", 18), ("issue-1097", 19), ("issue-1101", 18),
    ("issue-1102", 19), ("issue-1115", 18), ("issue-1116", 19), ("issue-1117", 18),
    ("issue-1118", 12), ("issue-1193", 18), ("issue-1216", 19), ("issue-1265", 13),
    ("issue-1351", 18), ("issue-1357", 15), ("issue-1635", 18), ("issue-1647", 19),
    ("issue-1653", 19), ("issue-954", 19), ("issue-956", 19), ("issue-960", 19),
    ("issue-972", 18), ("issue-993", 13), ("issue-994", 13),
];

#[test]
fn every_loaded_c08_copy_agrees_with_its_physical_reference_and_other_solved_copies() {
    let references: serde_json::Value = serde_json::from_str(include_str!("../metamorphic_corpus/1753-accuracy-reference.json")).unwrap();
    let sources: serde_json::Value = serde_json::from_str(include_str!("../../../docs/results-changes/1753-loaded-c08-inputs.json")).unwrap();
    let mut total_splits = 0;
    let mut tested = 0;
    let mut visited_copies = 0;
    let mut designated = 0;
    let mut compared = 0;
    let mut worst = 0.0f64;
    let models = c08();
    assert_eq!(models.len()+SAME_MODEL.len(), C08.len());
    let minimum_copies = models.len()*15;
    for (name, m) in models {
        let m = loaded(m);
        let required = SOLVABLE.iter().find(|&&(n, _)| n == name).map(|&(_, count)| count);
        assert_eq!(required.is_some(), sources.get(&name).is_some(), "{name}: designated solvable reference");
        if required.is_some() { designated += 1; }
        if let Some(source) = sources.get(&name) {
            let input = match &m { Model::D2(s) => serde_json::to_value(s).unwrap(), Model::D3(s) => serde_json::to_value(s).unwrap() };
            assert_eq!(input, source["input"], "{name}: physical reference input");
        }
        let mut solved = Vec::new();
        let mut outcomes = Vec::new();
        let mut kinds = std::collections::BTreeSet::new();
        let mut skipped = std::collections::BTreeSet::new();
        for (what, copy, change) in copies(&name, &m) {
            let copy = match copy { Ok(c) => c, Err(e) => {
                assert!(unsupported(&name, &what, &e), "{name} {what}: {e}");
                skipped.insert(kind(&what).to_string());
                continue;
            } };
            kinds.insert(kind(&what).to_string());
            if what != "original" { visited_copies += 1; }
            match solve(&copy) {
                Ok(actual) => {
                    if what != "original" { tested += 1; }
                    let v = &references[&name];
                    assert!(!v.is_null(), "{name} {what}: missing physical reference");
                    let reference = reference(v, matches!(m, Model::D2(_)));
                    let actual = change.response(&actual, true);
                    let force = v["force_scale"].as_str().unwrap().parse().unwrap();
                    let length = v["length"].as_str().unwrap().parse().unwrap();
                    println!("ACCURACY {name} {what}");
                    worst = worst.max(compare(&actual, &reference, &reference, force, length));
                    for previous in &solved { worst = worst.max(compare(&actual, previous, &reference, force, length)); }
                    solved.push(actual); outcomes.push(true); compared += 1;
                },
                Err(e) => {
                    assert!(expected_refusal(&name, &e), "{name} {what}: unexpected refusal: {e}");
                    assert!(required.is_none(), "{name} {what}: designated solvable copy refused: {e}");
                    println!("REFUSED {name} {what}: {e}"); outcomes.push(false);
                },
            }
        }
        for &(_, k, _) in UNSUPPORTED.iter().filter(|&&(n, _, _)| n == name) {
            assert!(!kinds.contains(k) && skipped.contains(k), "{name} {k} is listed unsupported but was built or never refused as such");
        }
        assert!(!outcomes.is_empty());
        if let Some(required) = required { assert!(solved.len() >= required, "{name}: {} successful comparisons, require {required}", solved.len()); }
        let splits = outcomes.iter().skip(1).filter(|&&s| s != outcomes[0]).count();
        println!("OUTCOMES {name}: {} solved, {} refused, {splits} splits", solved.len(), outcomes.len()-solved.len());
        total_splits += splits;
    }
    println!("LOADED C08: {compared} solved copies, {total_splits} splits, worst comparison {worst:.16e}");
    assert!(visited_copies >= minimum_copies, "{visited_copies} supported copies visited");
    assert_eq!(designated, SOLVABLE.len());
    let required: usize = SOLVABLE.iter().map(|&(_, count)| count).sum();
    assert!(compared >= required, "{compared} successful comparisons, require {required}");
    let originals = SOLVABLE.len();
    assert!(tested >= required - originals, "{tested} transformed copies compared");
}
