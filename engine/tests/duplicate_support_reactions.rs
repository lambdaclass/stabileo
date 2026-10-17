//! Several supports on one node (found by the `model_certify` fuzz target,
//! docs/verification/FUZZ_MUTANTS.md). First symptom: the reactions listed one
//! entry per support, each carrying the node's full restrained-DOF reaction,
//! so ΣR double-counted it and a certified result was out of global
//! equilibrium by the applied load.
//!
//! The root cause is that the solver read such a model inconsistently: in 2D
//! the DOF numbering kept only the highest-id support of a node (a `fixed`
//! support with id 1 and a `pinned` one with id 2 left a pinned end, silently),
//! in 3D it ORed the flags but took springs and the inclined flag from one
//! support picked in hash order. Now plain rigid restraints merge by OR in 2D
//! and 3D, with one reaction entry per node, and any other combination
//! (springs, settlements, inclined directions) is rejected with an error naming
//! the node. The web app keeps one support per node.

use dedaliano_engine::certify::{buckling::certify_buckling_2d, certify_linear_2d_full, certify_linear_3d_full, modal::certify_modal_3d};
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::solver::modal::solve_modal_2d;
use dedaliano_engine::types::*;
use serde_json::json;
use std::collections::HashMap;

fn cantilever_2d(second_support: serde_json::Value) -> SolverInput {
    serde_json::from_value(json!({
        "nodes": { "1": { "id": 1, "x": 0.0, "z": 0.0 }, "2": { "id": 2, "x": 3.0, "z": 0.0 } },
        "materials": { "1": { "id": 1, "e": 200000.0, "nu": 0.3 } },
        "sections": { "1": { "id": 1, "a": 0.01, "iz": 1e-4 } },
        "elements": { "1": { "id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1 } },
        "supports": {
            "1": { "id": 1, "nodeId": 1, "type": "fixed" },
            "2": second_support
        },
        "loads": [{ "type": "nodal", "data": { "nodeId": 2, "fx": 123.0, "fz": -40.0, "my": 7.0 } }]
    }))
    .unwrap()
}

fn cantilever_3d() -> SolverInput3D {
    let sup = |dx: Option<f64>| {
        json!({ "nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true, "dx": dx })
    };
    serde_json::from_value(json!({
        "nodes": { "1": { "id": 1, "x": -0.5, "y": -0.5, "z": -1.0 }, "2": { "id": 2, "x": -0.5, "y": -35.5, "z": -0.5 } },
        "materials": { "1": { "id": 1, "e": 100000.0, "nu": 0.3 } },
        "sections": { "1": { "id": 1, "a": 0.01, "iy": 1e-4, "iz": 5e-5, "j": 3e-5 } },
        "elements": { "1": { "id": 1, "type": "frame", "nodeI": 2, "nodeJ": 1, "materialId": 1, "sectionId": 1 } },
        "supports": { "1": sup(Some(0.0)), "2": sup(None) },
        "loads": [{ "type": "nodal", "data": { "nodeId": 2, "fx": 123.0, "fy": 8.0, "fz": 10.0, "mx": 0.0, "my": 0.0, "mz": 0.0 } }]
    }))
    .unwrap()
}

fn assert_balanced(sum: &[f64], load: &[f64]) {
    for (s, f) in sum.iter().zip(load) {
        assert!((s + f).abs() < 1e-6 * (1.0 + f.abs()), "ΣR = {sum:?} does not balance the load {load:?}");
    }
}

fn assert_rejected<T: std::fmt::Debug>(r: Result<T, String>, what: &str) {
    let err = r.expect_err(&format!("{what}: an ambiguous pair of supports on one node must be rejected"));
    assert!(err.contains("Node 1 has several supports (1, 2)"), "{what}: unexpected error {err:?}");
}

#[test]
fn two_rigid_supports_on_one_node_2d() {
    for second in [
        json!({ "id": 2, "nodeId": 1, "type": "fixed" }),
        json!({ "id": 2, "nodeId": 1, "type": "fixed", "dx": 0.0 }),
        json!({ "id": 2, "nodeId": 1, "type": "pinned" }),
        json!({ "id": 2, "nodeId": 1, "type": "rollerX" }),
    ] {
        let input = cantilever_2d(second);
        let r = solve_2d(&input).unwrap();
        assert_eq!(r.reactions.len(), 1, "one reaction entry per supported node: {:?}", r.reactions);
        assert_balanced(&[r.reactions[0].rx, r.reactions[0].rz], &[123.0, -40.0]);
        let c = certify_linear_2d_full(&input).unwrap();
        assert!(c.certificate.is_certified());
        assert_balanced(&[c.results.reactions[0].rx, c.results.reactions[0].rz], &[123.0, -40.0]);
    }
}

/// The silently wrong case: `fixed` (id 1) and `pinned` (id 2) on one end of a
/// propped beam gave the pinned-end result. The merge restrains every DOF
/// either support restrains, so the end is fixed.
#[test]
fn rigid_supports_merge_by_or_2d() {
    let beam = |sups: serde_json::Value| -> SolverInput {
        serde_json::from_value(json!({
            "nodes": { "1": { "id": 1, "x": 0.0, "z": 0.0 }, "2": { "id": 2, "x": 3.0, "z": 0.0 }, "3": { "id": 3, "x": 6.0, "z": 0.0 } },
            "materials": { "1": { "id": 1, "e": 200000.0, "nu": 0.3 } },
            "sections": { "1": { "id": 1, "a": 0.01, "iz": 1e-4 } },
            "elements": {
                "1": { "id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1 },
                "2": { "id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1 }
            },
            "supports": sups,
            "loads": [{ "type": "nodal", "data": { "nodeId": 2, "fx": 0.0, "fz": -50.0, "my": 0.0 } }]
        }))
        .unwrap()
    };
    let roller = json!({ "id": 3, "nodeId": 3, "type": "rollerX" });
    let fixed = solve_2d(&beam(json!({ "1": { "id": 1, "nodeId": 1, "type": "fixed" }, "3": roller }))).unwrap();
    let pinned = solve_2d(&beam(json!({ "1": { "id": 1, "nodeId": 1, "type": "pinned" }, "3": roller }))).unwrap();
    let merged = solve_2d(&beam(json!({
        "1": { "id": 1, "nodeId": 1, "type": "fixed" }, "2": { "id": 2, "nodeId": 1, "type": "pinned" }, "3": roller
    })))
    .unwrap();
    let uz = |r: &AnalysisResults| r.displacements.iter().find(|d| d.node_id == 2).unwrap().uz;
    assert!((uz(&fixed) - uz(&pinned)).abs() > 0.1 * uz(&fixed).abs(), "the test must tell the two apart");
    assert!((uz(&merged) - uz(&fixed)).abs() <= 1e-12 * uz(&fixed).abs(), "merged {} vs fixed {}", uz(&merged), uz(&fixed));
    let r1 = merged.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r1.my.abs() > 1.0, "the merged end carries the fixed-end moment: {r1:?}");
}

#[test]
fn ambiguous_supports_on_one_node_rejected_2d() {
    for second in [
        // A spring and a rigid support: which one holds the DOF?
        json!({ "id": 2, "nodeId": 1, "type": "spring", "kx": 1.0, "ky": 1.0, "kz": 1.0 }),
        // A settlement on one of two supports.
        json!({ "id": 2, "nodeId": 1, "type": "rollerX", "dz": -0.01 }),
        json!({ "id": 2, "nodeId": 1, "type": "inclinedRoller", "angle": 0.3 }),
    ] {
        let input = cantilever_2d(second);
        assert_rejected(solve_2d(&input), "solve_2d");
        assert_rejected(certify_linear_2d_full(&input), "certify_linear_2d");
        assert_rejected(certify_buckling_2d(&input, 2), "certify_buckling_2d");
        let d: HashMap<String, f64> = [("1".to_string(), 7850.0)].into();
        assert_rejected(solve_modal_2d(&input, &d, 2), "solve_modal_2d");
    }
}

#[test]
fn two_rigid_supports_on_one_node_3d() {
    let input = cantilever_3d();
    let r = solve_3d(&input).unwrap();
    assert_eq!(r.reactions.len(), 1, "one reaction entry per supported node: {:?}", r.reactions);
    let x = &r.reactions[0];
    assert_balanced(&[x.fx, x.fy, x.fz], &[123.0, 8.0, 10.0]);
    let c = certify_linear_3d_full(&input).unwrap();
    assert!(c.certificate.is_certified());
    let x = &c.results.reactions[0];
    assert_balanced(&[x.fx, x.fy, x.fz], &[123.0, 8.0, 10.0]);
}

#[test]
fn ambiguous_supports_on_one_node_rejected_3d() {
    for change in [json!({ "kx": 1000.0 }), json!({ "dz": 0.01 }), json!({ "isInclined": true, "normalX": 1.0, "normalY": 0.0, "normalZ": 0.0 })] {
        let mut v = serde_json::to_value(cantilever_3d()).unwrap();
        for (k, x) in change.as_object().unwrap() {
            v["supports"]["2"][k] = x.clone();
        }
        let input: SolverInput3D = serde_json::from_value(v).unwrap();
        assert_rejected(solve_3d(&input), "solve_3d");
        assert_rejected(certify_linear_3d_full(&input), "certify_linear_3d");
        let d: HashMap<String, f64> = [("1".to_string(), 7850.0)].into();
        assert_rejected(certify_modal_3d(&input, &d, 2), "certify_modal_3d");
    }
}
