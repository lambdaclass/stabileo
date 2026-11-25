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

fn cancellation_boundaries(loaded: bool) -> Vec<(SolverInput, Vec<[f64; 2]>, bool)> {
    use dedaliano_engine::solver::stability::RESOLVABLE;
    [(1e8, false), ((RESOLVABLE-2.0)/4.0, false), (RESOLVABLE/4.0, true)].into_iter().map(|(stiff, refused)| {
        let mut s: Value = serde_json::to_value(witness("2013")).unwrap();
        s["nodes"] = json!({"1":{"id":1,"x":0.0,"z":0.0},"2":{"id":2,"x":1.0,"z":0.0},"3":{"id":3,"x":0.0,"z":1.0},"4":{"id":4,"x":1.0,"z":1.0}});
        s["materials"]["1"]["e"] = json!(stiff/1000.0);
        s["sections"]["1"]["a"] = json!(1.0);
        s["elements"] = json!({"1":{"id":1,"nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1,"type":"truss","hingeStart":false,"hingeEnd":false}});
        s["supports"] = json!({"1":{"id":1,"nodeId":1,"type":"rollerX","kx":0.5},"2":{"id":2,"nodeId":2,"type":"rollerX","kx":0.5},"3":{"id":3,"nodeId":3,"type":"fixed"},"4":{"id":4,"nodeId":4,"type":"fixed"}});
        s["constraints"] = json!([{"type":"linearMPC","terms":[{"nodeId":2,"dof":0,"coefficient":1.0},{"nodeId":1,"dof":0,"coefficient":-1.0}]}]);
        s["loads"] = if loaded {json!([{"type":"nodal","data":{"nodeId":1,"fx":1.0,"fz":0.0,"my":0.0}}])} else {json!([])};
        let x = if loaded {1.0} else {0.0};
        (serde_json::from_value(s).unwrap(), vec![[x,0.0],[x,0.0],[0.0;2],[0.0;2]], refused)
    }).collect()
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
    models.extend(cancellation_boundaries(loaded));
    let boundary_start = models.len() - 3;
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
            if index == 2 || index == 3 || index >= boundary_start {
                let (padded, _, _) = crate::case::pad_2d(&s);
                let mut expected = expected.clone();
                expected.resize(padded.nodes.len(), vec![0.0; 2]);
                cases.push(json!({"model":padded,"dim":2,"expected":expected,"refused":refused}));
            }
            let c = Case2::new("2013", s.clone());
            for entry in crate::ana2::rows().into_iter().filter(|a| (ENTRIES.contains(&a.name) || ["linear (WASM typed path)", "linear (sparse path)", "linear (PCG)"].contains(&a.name)) && (a.name != "P-Delta" || s.constraints.iter().any(|c| matches!(c, Constraint::LinearMPC(c) if c.terms.iter().all(|t| t.dof==2))))) {
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
fn unloaded_2d_entry_points() {
    run(false, false);
}

#[test]
fn loaded_2d_entry_points() {
    run(true, false);
}

#[test]
fn unloaded_3d_entry_points() {
    run(false, true);
}

#[test]
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
fn issue_2013_exact_zero_answer() {
    exact_zero("2013", "linear (load session)");
}

#[test]
fn issue_2014_exact_zero_answer() {
    exact_zero("2014", "linear");
}

#[test]
fn issue_2015_exact_zero_answer() {
    exact_zero("2015", "staged (loads in two stages)");
}

#[test]
fn issue_2016_exact_zero_answer() {
    exact_zero("2016", "creep & shrinkage (t = t0)");
}

#[test]
fn issue_2017_exact_zero_answer() {
    exact_zero("2017", "constrained");
}

#[test]
fn issue_2018_exact_zero_answer() {
    exact_zero("2018", "certified linear");
}

#[test]
fn material_nonlinear_zero_residual_requires_resolved_constraint_rank() {
    let mut failures = Vec::new();
    for (model, expected, refused) in cancellation_boundaries(false) {
        let planar = Case2::new("2013 material", model.clone());
        let spatial = Case3::new("2013 material", embed(&model, Plane::XZ));
        let row2 = crate::ana2::rows().into_iter().find(|a| a.name == "material nonlinear").unwrap();
        let row3 = crate::ana3::rows().into_iter().find(|a| a.name == "material nonlinear").unwrap();
        for (dim, result) in [(2, (row2.run)(&planar)), (3, (row3.run)(&spatial))] {
            match result {
                Err(e) if refused && e.contains("constraint reduction cancels stiffness contributions") => {}
                Ok(r) if !refused => verify(&r, &expected.iter().map(|v| {
                    if dim == 2 { v.to_vec() } else { Plane::XZ.point(v[0], v[1]).to_vec() }
                }).collect::<Vec<_>>(), dim == 3),
                Ok(_) => failures.push(format!("{dim}D: returned an answer at the refusal boundary")),
                Err(e) => failures.push(format!("{dim}D: {e}, expected refusal {refused}")),
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn kinematics_reports_constraint_rounding_despite_zero_rounded_mechanisms() {
    use dedaliano_engine::solver::kinematic::{analyze_kinematics_2d, analyze_kinematics_3d};

    for (model, _, refused) in cancellation_boundaries(false) {
        let spatial = embed(&model, Plane::XZ);
        for result in [analyze_kinematics_2d(&model), analyze_kinematics_3d(&spatial)] {
            assert_eq!(result.mechanism_modes, 0, "{}", result.diagnosis);
            assert_eq!(result.is_solvable, !refused, "{}", result.diagnosis);
            if refused {
                assert!(result.diagnosis.contains("constraint reduction cancels stiffness contributions"), "{}", result.diagnosis);
                assert_eq!(result.classification, "hypostatic");
            }
        }
    }
}

#[test]
fn modal_reports_constraint_rounding_before_the_eigensolve() {
    use dedaliano_engine::{certify, solver::modal};
    let mut case = crate::corpus::fuzz_case_2d(20754, 20795 - 20754);
    case.s = crate::common::explicit_rigid_support_control(&case.s);
    let densities = case.s.materials.keys().map(|id| (id.clone(), 1.0)).collect();
    let assert_refusal = |error: String| {
        let value: Value = serde_json::from_str(&error).unwrap_or_else(|_| panic!("{error}"));
        assert_eq!(value["structuredDiagnostics"][0]["code"], "reduced_stiffness_rank");
        assert_eq!(value["structuredDiagnostics"][0]["severity"], "error");
        assert!(value["message"].as_str().unwrap().contains("constraint reduction cancels stiffness contributions"));
    };
    assert_refusal(modal::solve_modal_2d(&case.s, &densities, 2).unwrap_err());
    assert_refusal(certify::modal::certify_modal_2d(&case.s, &densities, 2).unwrap_err());

    let assert_mode = |result: Result<Vec<f64>, String>, refused: bool| {
        if refused {
            assert_refusal(result.unwrap_err());
        } else {
            let modes = result.unwrap();
            assert_eq!(modes.len(), 1);
            assert!(modes[0].is_finite() && modes[0] > 0.0);
        }
    };
    for (model, _, refused) in cancellation_boundaries(false) {
        let spatial = embed(&model, Plane::XZ);
        for planar in [crate::case::pad_2d(&model).0, model] {
            assert_mode(modal::solve_modal_2d(&planar, &densities, 1)
                .map(|result| result.modes.iter().map(|mode| mode.omega).collect()), refused);
            assert_mode(certify::modal::certify_modal_2d(&planar, &densities, 1)
                .map(|result| result.results.modes.iter().map(|mode| mode.omega).collect()), refused);
        }
        assert_mode(modal::solve_modal_3d(&spatial, &densities, 1)
            .map(|result| result.modes.iter().map(|mode| mode.omega).collect()), refused);
        assert_mode(certify::modal::certify_modal_3d(&spatial, &densities, 1)
            .map(|result| result.results.modes.iter().map(|mode| mode.omega).collect()), refused);
    }
}
