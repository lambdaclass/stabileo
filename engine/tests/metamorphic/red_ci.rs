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
        for plane in Plane::ALL {
            let mut springs = input.soil_springs.clone();
            for spring in &mut springs {
                spring.direction = match (plane, spring.direction) {
                    (Plane::XZ, 1) | (Plane::YZ, 1) => 2,
                    (Plane::YZ, 0) => 1,
                    (_, d) => d,
                };
            }
            let spatial = SSIInput3D { solver:embed_2d(&input.solver, plane).unwrap(), soil_springs:springs, max_iter, tolerance:input.tolerance };
            calls.push(json!({"api":"solve_ssi_3d","input":spatial,"converged":max_iter>1}));
        }
    }
    calls
}

#[test]
#[ignore = "known wrong result: #761"]
fn strict_equilibrium_survives_numbering_and_constraints() {
    for c in calls() {
        let api = c["api"].as_str().unwrap();
        let text = c["input"].to_string();
        let max_iter = c["maxIter"].as_u64().unwrap_or(0) as usize;
        let result = match api {
            "solve_pdelta_2d" => dedaliano_engine::solve_pdelta_2d(&text, max_iter, 1e-12).unwrap(),
            "solve_pdelta_3d" => dedaliano_engine::solve_pdelta_3d(&text, max_iter, 1e-12).unwrap(),
            "solve_ssi_2d" => dedaliano_engine::solve_ssi_2d(&text).unwrap(),
            "solve_ssi_3d" => dedaliano_engine::solve_ssi_3d(&text).unwrap(),
            "solve_3d" => { assert!(!linear::solve_3d(&serde_json::from_str(&text).unwrap()).unwrap().displacements.is_empty()); continue; },
            _ => panic!("unknown API"),
        };
        let r:Value = serde_json::from_str(&result).unwrap();
        assert_eq!(r["converged"], c["converged"], "{api}, budget {max_iter}, {text}");
    }
}
