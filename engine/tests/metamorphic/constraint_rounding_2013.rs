use crate::{
    case::{Case2, Case3},
    response::Resp,
};
use dedaliano_engine::{
    metamorphic::{
        planes::{embed_2d, Plane},
        transform::{transform_2d, Iso2},
    },
    types::*,
};
use serde_json::{json, Value};

const ENTRIES: &[&str] = &[
    "linear",
    "linear (load session)",
    "constrained",
    "certified linear",
    "staged (one stage)",
    "staged (loads in two stages)",
    "creep & shrinkage (t = t0)",
    "P-Delta",
    "load combinations",
];

fn witness(key: &str) -> SolverInput {
    let all: Value =
        serde_json::from_str(include_str!("../fixtures/nightly-2026-11-13.json")).unwrap();
    serde_json::from_value(all[key].clone()).unwrap()
}

fn models(loaded: bool) -> Vec<(SolverInput, Vec<[f64; 2]>)> {
    let mut base = witness("2013");
    let mut expected = vec![[0.0; 2]; 4];
    if loaded {
        let a = &base.nodes["1"];
        let b = &base.nodes["2"];
        let d = [b.x - a.x, b.z - a.z];
        let length = d[0].hypot(d[1]);
        let ea = base.materials["1"].e * 1000.0 * base.sections["1"].a;
        base.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: 0.001 * d[0] / length,
            fz: 0.001 * d[1] / length,
            my: 0.0,
        })];
        expected[1] = d.map(|v| 0.001 * v / ea);
        expected[2] = expected[1];
        let c = 1.9479567481263578;
        expected[3][1] = c * expected[1][1];
        let t = &base.nodes["4"];
        expected[3][0] =
            expected[1][0] - (t.z - b.z) / (t.x - b.x) * (expected[3][1] - expected[1][1]);
    } else {
        base.loads.clear();
    }
    let mut out = Vec::new();
    for iso in [
        Iso2::rotation(0.0),
        Iso2::rotation(1.140893476817853),
        Iso2::mirror_line(0.61),
    ] {
        let s = transform_2d(&base, &iso).unwrap();
        let u = expected
            .iter()
            .map(|&v| iso.apply_vec(v))
            .collect::<Vec<_>>();
        out.push((s.clone(), u.clone()));
        let mut pinned = s;
        pinned
            .constraints
            .push(Constraint::LinearMPC(LinearMPCConstraint {
                terms: vec![MPCTerm {
                    node_id: 4,
                    dof: 2,
                    coefficient: 1.0,
                }],
            }));
        out.push((pinned, u));
    }
    if !loaded {
        out.push((witness("2013"), expected.clone()));
        out.push((witness("transformed-2013"), expected));
    }
    out
}

fn embed(s: &SolverInput, plane: Plane) -> SolverInput3D {
    let mut plain = s.clone();
    plain.constraints.clear();
    let mut out = embed_2d(&plain, plane).unwrap();
    let axes = [plane.e1(), plane.e2(), plane.normal()];
    out.constraints = s
        .constraints
        .iter()
        .map(|c| {
            let Constraint::LinearMPC(c) = c else {
                unreachable!()
            };
            Constraint::LinearMPC(LinearMPCConstraint {
                terms: c
                    .terms
                    .iter()
                    .map(|t| {
                        let axis = axes[t.dof].iter().position(|x| *x != 0.0).unwrap();
                        MPCTerm {
                            node_id: t.node_id,
                            dof: axis + if t.dof == 2 { 3 } else { 0 },
                            coefficient: t.coefficient * axes[t.dof][axis],
                        }
                    })
                    .collect(),
            })
        })
        .collect();
    out
}

fn verify(r: &Resp, expected: &[Vec<f64>], three: bool) {
    assert_eq!(r.0.iter().filter(|x| x.tag == "u").count(), 4);
    let size = expected
        .iter()
        .flatten()
        .map(|x| x.abs())
        .fold(0.0, f64::max);
    let bound = if size == 0.0 { 0.0 } else { size * 1e-8 };
    for node in 1..=4 {
        let u = r.node_vec(node, "u").unwrap();
        assert_eq!(u.len(), expected[node - 1].len());
        for (actual, target) in u.iter().zip(&expected[node - 1]) {
            assert!(
                actual.is_finite() && (actual - target).abs() <= bound,
                "node {node}: {actual:e} != {target:e}, bound {bound:e}"
            );
        }
        for rotation in r.node_vec(node, if three { "r" } else { "ry" }).unwrap() {
            assert!(
                rotation.is_finite() && rotation.abs() <= bound,
                "node {node} spin {rotation:e}, bound {bound:e}"
            );
        }
    }
}

fn run(loaded: bool, three: bool) {
    let mut failures = Vec::new();
    let mut cases = Vec::new();
    let mut models: Vec<_> = models(loaded)
        .into_iter()
        .map(|(s, u)| (s, u, false))
        .collect();
    for (mut s, u, _) in models.clone() {
        s.constraints
            .retain(|c| matches!(c, Constraint::LinearMPC(c) if c.terms.iter().all(|t| t.dof==2)));
        models.push((s, u, true));
    }
    for (index, (s, expected, refused)) in models.into_iter().enumerate() {
        if three {
            for plane in Plane::ALL {
                let s = embed(&s, plane);
                let expected: Vec<Vec<f64>> = expected
                    .iter()
                    .map(|u| plane.point(u[0], u[1]).to_vec())
                    .collect();
                cases.push(json!({"model":s,"dim":3,"expected":expected,"refused":refused}));
                let c = Case3::new("2013", s.clone());
                for entry in crate::ana3::rows().into_iter().filter(|a| ENTRIES.contains(&a.name) && (a.name != "P-Delta" || s.constraints.iter().any(|c| matches!(c, Constraint::LinearMPC(c) if c.terms.iter().all(|t| t.dof>=3))))) {
                    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        let r = (entry.run)(&c);
                        if refused { assert!(r.is_err(), "accepted a translational mechanism"); }
                        else { verify(&r.unwrap(), &expected, true); }
                    }));
                    if result.is_err() { failures.push(format!("{index} {plane:?} {}", entry.name)); }
                }
            }
        } else {
            let expected: Vec<Vec<f64>> = expected.iter().map(|v| v.to_vec()).collect();
            cases.push(json!({"model":s,"dim":2,"expected":expected,"refused":refused}));
            let c = Case2::new("2013", s.clone());
            for entry in crate::ana2::rows().into_iter().filter(|a| (ENTRIES.contains(&a.name) || a.name == "linear (WASM typed path)") && (a.name != "P-Delta" || s.constraints.iter().any(|c| matches!(c, Constraint::LinearMPC(c) if c.terms.iter().all(|t| t.dof==2))))) {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    let r = (entry.run)(&c);
                    if refused { assert!(r.is_err(), "accepted a translational mechanism"); }
                    else { verify(&r.unwrap(), &expected, false); }
                }));
                if result.is_err() { failures.push(format!("{index} {}", entry.name)); }
            }
        }
    }
    if let Ok(path) = std::env::var("CONSTRAINT_2013_CASES") {
        std::fs::write(
            format!("{path}.{}.{}.json", if three { 3 } else { 2 }, loaded),
            serde_json::to_vec(&cases).unwrap(),
        )
        .unwrap();
    }
    assert!(failures.is_empty(), "{failures:?}");
}

#[test]
#[ignore = "known wrong result: #2013"]
fn unloaded_2d_entry_points() {
    run(false, false);
}

#[test]
#[ignore = "known wrong result: #2013"]
fn loaded_2d_entry_points() {
    run(true, false);
}

#[test]
#[ignore = "known wrong result: #2013"]
fn unloaded_3d_entry_points() {
    run(false, true);
}

#[test]
#[ignore = "known wrong result: #2013"]
fn loaded_3d_entry_points() {
    run(true, true);
}

fn exact_zero(issue: &str, name: &str) {
    let base = witness(issue);
    let transformed = witness("transformed-2013");
    assert_eq!(
        serde_json::to_value(&base).unwrap(),
        serde_json::to_value(witness("2013")).unwrap()
    );
    let entry = crate::ana2::rows()
        .into_iter()
        .find(|a| a.name == name)
        .unwrap();
    for s in [base, transformed] {
        let force = s.loads.iter().fold([0.0; 3], |mut f, l| {
            let SolverLoad::Nodal(l) = l else {
                unreachable!()
            };
            assert_eq!(l.node_id, 1);
            for (a, b) in f.iter_mut().zip([l.fx, l.fz, l.my]) {
                *a += b;
            }
            f
        });
        let r = (entry.run)(&Case2::new(issue, s)).unwrap();
        verify(&r, &vec![vec![0.0; 2]; 4], false);
        assert!(r
            .0
            .iter()
            .filter(|x| x.tag != "R" && x.tag != "RM")
            .flat_map(|x| &x.v)
            .all(|v| *v == 0.0));
        if let Some(reaction) = r.node_vec(1, "R") {
            assert_eq!(reaction, vec![-force[0], -force[1]]);
        }
        if let Some(moment) = r.node_vec(1, "RM") {
            assert_eq!(moment, vec![-force[2]]);
        }
    }
}

#[test]
#[ignore = "known wrong result: #2013"]
fn issue_2013_exact_zero_answer() {
    exact_zero("2013", "linear (load session)");
}

#[test]
#[ignore = "known wrong result: #2014"]
fn issue_2014_exact_zero_answer() {
    exact_zero("2014", "linear");
}

#[test]
#[ignore = "known wrong result: #2015"]
fn issue_2015_exact_zero_answer() {
    exact_zero("2015", "staged (loads in two stages)");
}

#[test]
#[ignore = "known wrong result: #2016"]
fn issue_2016_exact_zero_answer() {
    exact_zero("2016", "creep & shrinkage (t = t0)");
}

#[test]
#[ignore = "known wrong result: #2017"]
fn issue_2017_exact_zero_answer() {
    exact_zero("2017", "constrained");
}

#[test]
#[ignore = "known wrong result: #2018"]
fn issue_2018_exact_zero_answer() {
    exact_zero("2018", "certified linear");
}
