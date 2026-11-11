use dedaliano_engine::{metamorphic::{planes::{embed_2d, Plane}, relabel::Relabel}, solver::{linear, pdelta, ssi::{SSIInput, SSIInput3D}}, types::*};
use serde_json::{json, Value};

pub(crate) fn calls() -> Vec<Value> {
    let s: SolverInput3D = serde_json::from_str(include_str!("../metamorphic_corpus/feature_matrix/3d-shell-self-weight-mitc4-strip-equiv.json")).unwrap();
    let relabel = Relabel::random_3d(&s, 12758164673192605130);
    let mut calls = Vec::new();
    for solver in [s.clone(), relabel.apply_3d(&s, 12758164673192605130)] {
        for max_iter in [0, 100] {
            calls.push(json!({"api":"solve_pdelta_3d","input":solver,"maxIter":max_iter,"tolerance":1e-12,"converged":max_iter>0}));
        }
        let r = linear::solve_3d(&solver).unwrap();
        calls.push(json!({"api":"solve_3d","input":solver,"converged":true,"expectedDisplacements":r.displacements}));
    }
    let s: SolverInput = serde_json::from_str(include_str!("../fixtures/ex-cantilever-point-input.json")).unwrap();
    let r = pdelta::solve_pdelta_2d(&s, 100, 1e-12).unwrap();
    assert!(r.converged);
    calls.push(json!({"api":"solve_pdelta_2d","input":s,"maxIter":100,"tolerance":1e-12,"converged":true,"expectedDisplacements":r.results.displacements}));
    let input: SSIInput = serde_json::from_str(include_str!("ssi-constrained-761.json")).unwrap();
    for max_iter in [1, 300] {
        let mut input = input.clone();
        input.max_iter = max_iter;
        calls.push(json!({"api":"solve_ssi_2d","input":input,"converged":max_iter>1}));
        let mut spatial: SSIInput3D = serde_json::from_str(include_str!("ssi-constrained-3d-761.json")).unwrap();
        spatial.max_iter = max_iter;
        calls.push(json!({"api":"solve_ssi_3d","input":spatial,"converged":max_iter>1}));
    }
    let pile: Value = serde_json::from_str(include_str!("ssi-axial-pile-761.json")).unwrap();
    for rigid in [false, true] {
        let mut input: SSIInput = serde_json::from_value(pile["input"].clone()).unwrap();
        if rigid {
            input.solver.constraints = serde_json::from_value(json!((2..=11).map(|node| json!({"type":"equalDOF","masterNode":1,"slaveNode":node,"dofs":[1]})).collect::<Vec<_>>())).unwrap();
        }
        let capacity = json!({"delta":pile["delta"],"shaft":pile["shaft"],"tip":pile["tip"],"displacement":"uz"});
        calls.push(json!({"api":"solve_ssi_2d","input":input,"converged":rigid,"pileCapacity":capacity}));
        for plane in Plane::ALL {
            let mut planar = input.solver.clone();
            planar.constraints.clear();
            let mut solver = embed_2d(&planar, plane).unwrap();
            let axis = if plane == Plane::XY { 1 } else { 2 };
            if rigid {
                solver.constraints = serde_json::from_value(json!((2..=11).map(|node| json!({"type":"equalDOF","masterNode":1,"slaveNode":node,"dofs":[axis]})).collect::<Vec<_>>())).unwrap();
            }
            let springs = input.soil_springs.iter().map(|s| dedaliano_engine::solver::ssi::SoilSpring { direction:axis, ..s.clone() }).collect();
            let spatial = SSIInput3D { solver, soil_springs:springs, max_iter:input.max_iter, tolerance:input.tolerance };
            let mut capacity = capacity.clone();
            capacity["displacement"] = json!(["ux","uy","uz"][axis]);
            calls.push(json!({"api":"solve_ssi_3d","input":spatial,"converged":rigid,"pileCapacity":capacity}));
        }
    }
    let point = json!({"nodes":{"1":{"id":1,"x":0.0,"z":0.0}},
        "materials":{},"sections":{},"elements":{},
        "supports":{"1":{"id":1,"nodeId":1,"type":"spring","kx":1e16,"ky":1.0,"kz":1.0}},
        "loads":[{"type":"nodal","data":{"nodeId":1,"fx":1e16,"fz":0.0,"my":0.0}}]});
    let point: SolverInput = serde_json::from_value(point).unwrap();
    calls.push(json!({"api":"solve_2d","input":point,"converged":true,"expectedDisplacements":[{"nodeId":1,"ux":1.0,"uz":0.0,"ry":0.0}]}));
    for plane in Plane::ALL {
        let expected = if plane == Plane::YZ { json!({"nodeId":1,"ux":0.0,"uy":1.0,"uz":0.0}) } else { json!({"nodeId":1,"ux":1.0,"uy":0.0,"uz":0.0}) };
        calls.push(json!({"api":"solve_3d","input":embed_2d(&point,plane).unwrap(),"converged":true,"expectedDisplacements":[expected]}));
    }
    for tolerance in [1e-20, 1e-15] {
        for soil in [false, true] {
            let springs: Vec<dedaliano_engine::solver::ssi::SoilSpring> = if soil { serde_json::from_value(json!([{"nodeId":1,"direction":0,"tributaryLength":1.0,"curve":{"type":"custom","points":[[0.0,0.0],[2.0,2.0]]}}])).unwrap() } else { vec![] };
            let input = SSIInput { solver:point.clone(), soil_springs:springs.clone(), max_iter:5, tolerance };
            calls.push(json!({"api":"solve_ssi_2d","input":input,"converged":!soil || tolerance>1e-16,"smallSoilBalance":true,"expectedDisplacements":[{"nodeId":1,"ux":1.0,"uz":0.0,"ry":0.0}]}));
            for plane in Plane::ALL {
                let spatial = SSIInput3D { solver:embed_2d(&point, plane).unwrap(), soil_springs:springs.iter().map(|s| dedaliano_engine::solver::ssi::SoilSpring { direction:if plane == Plane::YZ { 1 } else { 0 }, ..s.clone() }).collect(), max_iter:5, tolerance };
                calls.push(json!({"api":"solve_ssi_3d","input":spatial,"converged":!soil || tolerance>1e-16,"smallSoilBalance":true,"expectedDisplacements":[if plane == Plane::YZ { json!({"nodeId":1,"ux":0.0,"uy":1.0,"uz":0.0}) } else { json!({"nodeId":1,"ux":1.0,"uy":0.0,"uz":0.0}) }]}));
            }
        }
    }
    calls
}

#[test]
#[ignore = "known wrong result: #761"]
fn strict_equilibrium_survives_numbering_and_constraints() {
    let calls = calls();
    if let Ok(path) = std::env::var("RED_CI_CASES") {
        std::fs::write(path, serde_json::to_vec(&calls).unwrap()).unwrap();
    }
    for c in calls {
        let api = c["api"].as_str().unwrap();
        let text = c["input"].to_string();
        let max_iter = c["maxIter"].as_u64().unwrap_or(0) as usize;
        let result = match api {
            "solve_pdelta_2d" => dedaliano_engine::solve_pdelta_2d(&text, max_iter, 1e-12).unwrap(),
            "solve_pdelta_3d" => dedaliano_engine::solve_pdelta_3d(&text, max_iter, 1e-12).unwrap(),
            "solve_ssi_2d" => dedaliano_engine::solve_ssi_2d(&text).unwrap(),
            "solve_ssi_3d" => dedaliano_engine::solve_ssi_3d(&text).unwrap(),
            "solve_2d" => { assert!(!linear::solve_2d(&serde_json::from_str(&text).unwrap()).unwrap().displacements.is_empty()); continue; },
            "solve_3d" => { assert!(!linear::solve_3d(&serde_json::from_str(&text).unwrap()).unwrap().displacements.is_empty()); continue; },
            _ => panic!("unknown API"),
        };
        let r:Value = serde_json::from_str(&result).unwrap();
        assert_eq!(r["converged"], c["converged"], "{api}, budget {max_iter}, {text}");
        check_capacity(&r, &c);
    }
}

pub(crate) fn check_capacity(r: &Value, c: &Value) {
    let capacity = &c["pileCapacity"];
    if capacity.is_null() { return; }
    let close = |actual: f64, expected: f64| assert!((actual-expected).abs() <= 1e-6 * expected.abs().max(1e-12), "{actual} vs {expected}");
    for d in r["results"]["displacements"].as_array().unwrap() {
        close(-d[capacity["displacement"].as_str().unwrap()].as_f64().unwrap(), capacity["delta"].as_f64().unwrap());
    }
    let springs = r["springResults"].as_array().unwrap();
    close(-springs[..11].iter().map(|s| s["reaction"].as_f64().unwrap()).sum::<f64>(), capacity["shaft"].as_f64().unwrap());
    close(-springs[11]["reaction"].as_f64().unwrap(), capacity["tip"].as_f64().unwrap());
}

#[test]
#[ignore = "known wrong result: #761"]
fn small_soil_force_cannot_disappear_between_structure_and_applied_load() {
    let calls: Vec<_> = calls().into_iter().filter(|c| c["smallSoilBalance"] == true).collect();
    if let Ok(path) = std::env::var("RED_CI_CASES") {
        std::fs::write(path, serde_json::to_vec(&calls).unwrap()).unwrap();
    }
    for c in calls {
        let text = c["input"].to_string();
        let result = if c["api"] == "solve_ssi_2d" {
            dedaliano_engine::solve_ssi_2d(&text).unwrap()
        } else { dedaliano_engine::solve_ssi_3d(&text).unwrap() };
        let r:Value = serde_json::from_str(&result).unwrap();
        assert_eq!(r["converged"], c["converged"], "{c}");
    }
}
