//! A linear solve of a model whose stiffness matrix is singular or indefinite is
//! refused by the stability test; well-posed models never carry a
//! `StiffnessNotPositiveDefinite` warning.

use crate::common;
use crate::fuzz_models;

use common::*;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::types::*;

fn warned(d: &[StructuredDiagnostic]) -> bool {
    d.iter()
        .any(|x| x.code == DiagnosticCode::StiffnessNotPositiveDefinite && x.severity == Severity::Warning)
}

/// Fuzz models the certificate checker found non-positive-definite: 2D seed 86
/// (Cholesky "succeeded" with a 2e-16 pivot ratio) and 3D seed 31 (Cholesky
/// failed and dense LU returned a warned candidate). The stability test refuses
/// both before any factorization.
#[test]
fn non_positive_definite_fuzz_models_are_refused() {
    let mut m86 = fuzz_models::random_2d_model(86);
    assert!(solve_2d(&m86).unwrap_err().contains("no rotational degrees of freedom"));
    for l in &mut m86.loads {
        if let SolverLoad::Nodal(n) = l {
            n.my = 0.0;
        }
    }
    let error = solve_2d(&m86).unwrap_err();
    assert!(error.starts_with("the structure is a mechanism"), "{error}");
}

#[test]
fn non_positive_definite_3d_fuzz_model_is_refused() {
    let error = solve_3d(&fuzz_models::random_3d_model(100_031)).unwrap_err();
    assert!(error.starts_with("the structure is a mechanism") || error.starts_with("the stiffness matrix is not positive"), "{error}");
}

/// Constrained solver: pinned columns tied at the top still sway. The reduced
/// CᵀKC is singular and the load excites its mechanism: refuse publication.
#[test]
fn constrained_mechanism_is_refused() {
    let mut mech = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, 3.0), (3, 4.0, 0.0), (4, 4.0, 3.0)],
        vec![(1, 30_000.0, 0.2)],
        vec![(1, 0.09, 6.75e-4)],
        vec![(1, "frame", 1, 2, 1, 1, false, false), (2, "frame", 3, 4, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 3, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 10.0, fz: 0.0, my: 0.0 })],
    );
    mech.constraints = vec![Constraint::EqualDOF(EqualDOFConstraint { master_node: 2, slave_node: 4, dofs: vec![0] })];
    let error = solve_2d(&mech).unwrap_err();
    assert!(error.contains("mechanism") || error.starts_with("REFUSE: self-check static_"), "{error}");
}

/// No false alarms: every fixture that solves cleanly, and the fuzz models
/// whose stiffness the certificate proved positive definite, stay unwarned.
#[test]
fn well_posed_models_are_not_warned() {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures");
    let mut checked = 0;
    for e in std::fs::read_dir(dir).unwrap() {
        let p = e.unwrap().path();
        let name = p.file_name().unwrap().to_str().unwrap().to_string();
        if !name.ends_with("-input.json") {
            continue;
        }
        let json = std::fs::read_to_string(&p).unwrap();
        let diags = if name.starts_with("ex-3d-") {
            let input: SolverInput3D = serde_json::from_str(&json).unwrap();
            solve_3d(&input).map(|r| r.structured_diagnostics)
        } else if let Ok(input) = serde_json::from_str::<SolverInput>(&json) {
            solve_2d(&input).map(|r| r.structured_diagnostics)
        } else {
            continue;
        };
        if let Ok(d) = diags {
            assert!(!warned(&d), "{name}: false alarm {d:?}");
            checked += 1;
        }
    }
    assert!(checked > 20, "only {checked} fixtures checked");
    use dedaliano_engine::certify::{certify_results_2d, certify_results_3d};
    for seed in 0..200u64 {
        let input = fuzz_models::random_2d_model(seed);
        if let Ok(res) = solve_2d(&input) {
            if certify_results_2d(&input, &res).is_certified() {
                assert!(!warned(&res.structured_diagnostics), "2d seed {seed}: certified PD but warned");
            }
        }
        let input = fuzz_models::random_3d_model(100_000 + seed);
        if let Ok(res) = solve_3d(&input) {
            if certify_results_3d(&input, &res).is_certified() {
                assert!(!warned(&res.structured_diagnostics), "3d seed {seed}: certified PD but warned");
            }
        }
    }
}

#[test]
fn fuzz_fixture_load_selection_is_deterministic() {
    let first_2d = serde_json::to_value(fuzz_models::random_2d_model(86)).unwrap();
    let first_3d = serde_json::to_value(fuzz_models::random_3d_model(100_031)).unwrap();
    for _ in 0..16 {
        assert_eq!(serde_json::to_value(fuzz_models::random_2d_model(86)).unwrap(), first_2d);
        assert_eq!(serde_json::to_value(fuzz_models::random_3d_model(100_031)).unwrap(), first_3d);
    }
}

fn cantilever_on_a_negative_spring_2d(n: usize, k: f64, method: &str) -> SolverInput {
    let tip = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: 0.0, fz: -1.0, my: 0.0 })];
    let mut input = make_beam(n, 4.0, 200e3, 0.01, 1e-4, "fixed", None, tip);
    let ground = n + 2;
    input.nodes.insert(ground.to_string(), serde_json::from_value(serde_json::json!({ "id": ground, "x": 4.0, "z": -1.0 })).unwrap());
    input.supports.insert("2".into(), serde_json::from_value(serde_json::json!({ "id": 2, "nodeId": ground, "type": "fixed" })).unwrap());
    input.connectors.insert("1".into(), serde_json::from_value(serde_json::json!({ "id": 1, "nodeI": n + 1, "nodeJ": ground, "kAxial": k })).unwrap());
    input.solver_options = Some(serde_json::from_value(serde_json::json!({ "method": method })).unwrap());
    input
}

fn cantilever_on_a_negative_spring_3d(n: usize, k: f64, method: &str) -> SolverInput3D {
    let tip = vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: n + 1, fx: 0.0, fy: 0.0, fz: -1.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })];
    let mut input = make_3d_beam(n, 4.0, 200e3, 0.3, 0.01, 1e-4, 1e-4, 1e-4, vec![true; 6], None, tip);
    let ground = n + 2;
    input.nodes.insert(ground.to_string(), serde_json::from_value(serde_json::json!({ "id": ground, "x": 4.0, "y": 0.0, "z": -1.0 })).unwrap());
    input.supports.insert("2".into(), serde_json::from_value(serde_json::json!({ "nodeId": ground, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true })).unwrap());
    input.connectors.insert("1".into(), serde_json::from_value(serde_json::json!({ "id": 1, "nodeI": n + 1, "nodeJ": ground, "kAxial": k })).unwrap());
    input.solver_options = Some(serde_json::from_value(serde_json::json!({ "method": method })).unwrap());
    input
}

/// A negative spring (a connector of negative axial stiffness to the ground) weaker than the
/// stiffness of its own node but stronger than the cantilever's tip stiffness 3EI/L³ leaves
/// every node block positive and the structure unstable; one stronger than its node's own
/// stiffness makes that node's block indefinite. Both are refused as not positive, never
/// solved with a warning; a negative spring weaker than the tip stiffness is solved.
#[test]
fn a_negative_spring_is_refused_on_every_linear_path() {
    let tip_stiffness = 3.0 * 200e6 * 1e-4 / 4.0f64.powi(3);
    for (n, methods) in [(2, vec!["direct"]), (40, vec!["direct", "pcg"])] {
        let element = 4.0 / n as f64;
        let node = 12.0 * 200e6 * 1e-4 / element.powi(3);
        for method in methods {
            for k in [-2.0 * tip_stiffness, -2.0 * node] {
                for (dims, result) in [("2D", solve_2d(&cantilever_on_a_negative_spring_2d(n, k, method)).map(|_| ())),
                    ("3D", solve_3d(&cantilever_on_a_negative_spring_3d(n, k, method)).map(|_| ()))] {
                    let error = result.expect_err(&format!("{dims} n {n} {method} k {k:e}: an unstable structure was solved"));
                    assert!(error.starts_with("the stiffness matrix is not positive"), "{dims} n {n} {method} k {k:e}: {error}");
                }
            }
        }
    }
    for (dims, result) in [("2D", solve_2d(&cantilever_on_a_negative_spring_2d(40, -0.5 * tip_stiffness, "direct")).map(|_| ())),
        ("3D", solve_3d(&cantilever_on_a_negative_spring_3d(40, -0.5 * tip_stiffness, "direct")).map(|_| ()))] {
        result.unwrap_or_else(|e| panic!("{dims}: a negative spring weaker than the structure is stable: {e}"));
    }
}
