use crate::{ana3, case::Case3, checks3, tally::Tally};
use dedaliano_engine::{solver::pdelta, types::SolverInput3D};

#[test]
fn issue_1940_dkt_pdelta_rotation() {
    let s: SolverInput3D = serde_json::from_str(include_str!(
        "../metamorphic_corpus/feature_matrix/3d-plate--dkt-triangle--strip-cantilever------0-equiv.json"
    )).unwrap();
    let c = Case3::new(
        "feature_matrix/3d-plate--dkt-triangle--strip-cantilever------0-equiv",
        s,
    );
    assert!(pdelta::solve_pdelta_3d(&c.s, 100, 1e-12).unwrap().converged);
    let tally = Tally::default();
    let ctx = checks3::Ctx {
        tally: &tally,
        rng_seed: 20261018,
    };
    let rows = ana3::rows()
        .into_iter()
        .filter(|a| a.name == "P-Delta")
        .collect::<Vec<_>>();
    checks3::check_case(&ctx, &c, &rows, &["rotation"]);
    assert_eq!(
        tally.status("P-Delta", "rotation"),
        "holds",
        "{}",
        tally.report()
    );
}

use crate::{ana2, case::Case2, checks2};
use dedaliano_engine::{
    metamorphic::{transform::Iso2, Rng},
    solver::linear,
    types::SolverInput,
};
use serde_json::{json, Value};

const PLATES: &[(&str, &str)] = &[
    ("3d-plate--dkt-triangle--strip-cantilever------0-equiv", include_str!("../metamorphic_corpus/feature_matrix/3d-plate--dkt-triangle--strip-cantilever------0-equiv.json")),
    ("3d-plate--dkt-triangle--strip-cantilever------0-with", include_str!("../metamorphic_corpus/feature_matrix/3d-plate--dkt-triangle--strip-cantilever------0-with.json")),
    ("3d-quad-shell--mitc4--strip-cantilever------0-equiv", include_str!("../metamorphic_corpus/feature_matrix/3d-quad-shell--mitc4--strip-cantilever------0-equiv.json")),
    ("3d-quad-shell--mitc4--strip-cantilever------0-with", include_str!("../metamorphic_corpus/feature_matrix/3d-quad-shell--mitc4--strip-cantilever------0-with.json")),
];

#[test]
fn plates_and_frames_keep_numerical_rotation_comparisons() {
    let names = [
        "linear",
        "linear (load session)",
        "linear (sparse path)",
        "linear (PCG)",
        "certified linear",
        "P-Delta",
    ];
    for (name, text) in PLATES {
        let c = Case3::new(
            format!("feature_matrix/{name}"),
            serde_json::from_str(text).unwrap(),
        );
        for seed in [20261018, 20754, 20261105] {
            let tally = Tally::default();
            let ctx = checks3::Ctx {
                tally: &tally,
                rng_seed: seed,
            };
            let rows = ana3::rows()
                .into_iter()
                .filter(|a| names.contains(&a.name))
                .collect::<Vec<_>>();
            checks3::check_case(&ctx, &c, &rows, &["rotation"]);
            for a in &rows {
                assert_eq!(
                    tally.status(a.name, "rotation"),
                    "holds",
                    "{name}, {seed}: {}",
                    tally.report()
                );
            }
        }
    }
    let s: SolverInput =
        serde_json::from_str(include_str!("../fixtures/cantilever-input.json")).unwrap();
    let c = Case2::new("frame-control", s);
    for seed in [20261018, 20754, 20261105] {
        let tally = Tally::default();
        let ctx = checks2::Ctx {
            tally: &tally,
            rng_seed: seed,
        };
        let rows = ana2::rows()
            .into_iter()
            .filter(|a| names.contains(&a.name))
            .collect::<Vec<_>>();
        checks2::check_case(&ctx, &c, &rows, &["rotation"]);
        for a in &rows {
            assert_eq!(
                tally.status(a.name, "rotation"),
                "holds",
                "{seed}: {}",
                tally.report()
            );
        }
    }
}

fn record(cases: &mut Vec<Value>, api: &str, input: Value, max_iter: usize, result: Value) {
    cases.push(json!({"api": api, "input": input, "maxIter": max_iter, "expected": result}));
}

fn check_export(
    cases: &mut Vec<Value>,
    input: &Value,
    dimension: usize,
    max_iter: usize,
    expected: &Value,
) {
    let text = input.to_string();
    for certified in [false, true] {
        let api = format!(
            "{}_pdelta_{dimension}d",
            if certified { "certify" } else { "solve" }
        );
        let result = match (dimension, certified) {
            (2, false) => dedaliano_engine::solve_pdelta_2d(&text, max_iter, 1e-12),
            (2, true) => dedaliano_engine::certify_pdelta_2d(&text, max_iter, 1e-12),
            (3, false) => dedaliano_engine::solve_pdelta_3d(&text, max_iter, 1e-12),
            (3, true) => dedaliano_engine::certify_pdelta_3d(&text, max_iter, 1e-12),
            _ => unreachable!(),
        }
        .unwrap();
        let mut result: Value = serde_json::from_str(&result).unwrap();
        if certified {
            result = result["results"].clone();
        }
        assert_eq!(
            result["converged"], expected["converged"],
            "{api}, {max_iter}"
        );
        assert_eq!(
            result["results"]["displacements"],
            expected["results"]["displacements"]
        );
        record(cases, &api, input.clone(), max_iter, result);
    }
}

#[test]
fn native_exports_and_wasm_cases_keep_answers_and_iteration_limits() {
    let mut cases = Vec::new();
    let analysis = ana3::rows()
        .into_iter()
        .find(|a| a.name == "P-Delta")
        .unwrap();
    for (name, text) in PLATES {
        let c = Case3::new(
            format!("feature_matrix/{name}"),
            serde_json::from_str(text).unwrap(),
        );
        let mut rng = Rng::new(20261018 ^ checks2::hash(&c.name) ^ checks2::hash("P-Delta") ^ 0x3d);
        let rotated = c.iso(&checks3::rotation_for(&analysis, &mut rng)).unwrap();
        for c in [c, rotated] {
            let result = pdelta::solve_pdelta_3d(&c.s, 100, 1e-12).unwrap();
            assert!(result.converged, "{name}");
            assert!(result.iterations > 1);
            let input = serde_json::to_value(&c.s).unwrap();
            for limit in [0, 1, result.iterations - 1, result.iterations, 100] {
                let limited = pdelta::solve_pdelta_3d(&c.s, limit, 1e-12).unwrap();
                assert_eq!(
                    limited.converged,
                    limit >= result.iterations,
                    "{name}, {limit}"
                );
                check_export(
                    &mut cases,
                    &input,
                    3,
                    limit,
                    &serde_json::to_value(limited).unwrap(),
                );
            }
            let lin = linear::solve_3d(&c.s).unwrap();
            record(
                &mut cases,
                "solve_3d",
                input,
                0,
                json!({"converged": true, "results":lin}),
            );
            let mut unloaded = c.s.clone();
            unloaded.loads.clear();
            let zero = pdelta::solve_pdelta_3d(&unloaded, 1, 1e-12).unwrap();
            assert!(zero.converged);
            assert!(zero.results.displacements.iter().all(|d| [
                d.ux, d.uy, d.uz, d.rx, d.ry, d.rz
            ]
            .iter()
            .all(|v| *v == 0.0)));
            check_export(
                &mut cases,
                &serde_json::to_value(unloaded).unwrap(),
                3,
                1,
                &serde_json::to_value(zero).unwrap(),
            );
        }
    }
    let mut s: SolverInput =
        serde_json::from_str(include_str!("../fixtures/cantilever-input.json")).unwrap();
    s.loads = vec![serde_json::from_value(
        json!({"type":"nodal","data":{"nodeId":2,"fx":-1.0,"fz":-0.25,"my":0.0}}),
    )
    .unwrap()];
    let c = Case2::new("frame-control", s);
    for c in [c.clone(), c.iso(&Iso2::rotation(0.731)).unwrap()] {
        let result = pdelta::solve_pdelta_2d(&c.s, 100, 1e-12).unwrap();
        assert!(result.converged && result.iterations > 1);
        let input = serde_json::to_value(&c.s).unwrap();
        for limit in [0, 1, result.iterations - 1, result.iterations, 100] {
            let limited = pdelta::solve_pdelta_2d(&c.s, limit, 1e-12).unwrap();
            assert_eq!(limited.converged, limit >= result.iterations);
            check_export(
                &mut cases,
                &input,
                2,
                limit,
                &serde_json::to_value(limited).unwrap(),
            );
        }
        record(
            &mut cases,
            "solve_2d",
            input,
            0,
            json!({"converged":true,"results":linear::solve_2d(&c.s).unwrap()}),
        );
    }
    if let Ok(path) = std::env::var("PLATE_CONVERGENCE_CASES") {
        std::fs::write(path, serde_json::to_string(&cases).unwrap()).unwrap();
    }
}
