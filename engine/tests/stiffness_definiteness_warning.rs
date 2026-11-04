//! A model whose stiffness matrix is singular or indefinite may still get results
//! (dense LU, a diagonal shift, or a Cholesky with round-off pivots). Those
//! results carry a `StiffnessNotPositiveDefinite` warning; well-posed models
//! never do. Failed hard self-checks refuse results instead.

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
/// (Cholesky "succeeds" with a 2e-16 pivot ratio) and 3D seed 31 (Cholesky
/// fails, dense LU returns a warned, equilibrated candidate).
#[test]
fn non_positive_definite_fuzz_models_are_warned() {
    // The model is all trusses: its nodal moments have no rotation DOF to act
    // on and are refused (validate_loads_2d); the forces alone still leave
    // the stiffness singular.
    let mut m86 = fuzz_models::random_2d_model(86);
    assert!(solve_2d(&m86).unwrap_err().contains("no rotational degrees of freedom"));
    for l in &mut m86.loads {
        if let SolverLoad::Nodal(n) = l {
            n.my = 0.0;
        }
    }
    let res = solve_2d(&m86).expect("solver returns results");
    assert!(warned(&res.structured_diagnostics), "{:?}", res.structured_diagnostics);
}

#[test]
fn non_positive_definite_3d_fuzz_model_is_warned() {
    let res = solve_3d(&fuzz_models::random_3d_model(100_031)).expect("unexcited mechanism returns warned equilibrium");
    assert!(warned(&res.structured_diagnostics), "{:?}", res.structured_diagnostics);
    let d = res.structured_diagnostics.iter().find(|x| x.code == DiagnosticCode::StiffnessNotPositiveDefinite).unwrap();
    assert!(d.message.contains("singular or indefinite") && d.message.contains("meaningless"), "{}", d.message);
    let checks: Vec<_> = res.structured_diagnostics.iter()
        .filter(|d| d.phase.as_deref().unwrap_or("").starts_with("self_check:")).collect();
    assert_eq!(checks.len(), 2);
    assert!(checks.iter().all(|d| d.value.unwrap() < 1e-3));
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
