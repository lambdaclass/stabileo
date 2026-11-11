use crate::{
    ana2, ana3,
    case::{Case2, Case3},
};
use dedaliano_engine::solver::{
    linear,
    stability::{self, Reason, Verdict},
};
use dedaliano_engine::types::{SolverInput, SolverInput3D};

fn input(issue: &str) -> serde_json::Value {
    let fixtures: serde_json::Value =
        serde_json::from_str(include_str!("../fixtures/cause-c-replay.json")).unwrap();
    fixtures.get(issue).unwrap().clone()
}

fn mechanism_2d(issue: &str, analysis: &str, node: usize) {
    let solver: SolverInput = serde_json::from_value(input(issue)).unwrap();
    let verdict = stability::of_2d(&solver).unwrap();
    assert_eq!(verdict.verdict, Verdict::Mechanism);
    assert_eq!(verdict.reason, Reason::FreeTranslation);
    assert_eq!(verdict.mode_nodes, vec![node]);
    let row = ana2::rows()
        .into_iter()
        .find(|a| a.name == analysis)
        .unwrap();
    let error =
        (row.run)(&Case2::new("replay", solver)).expect_err("a mechanism returned a response");
    assert_eq!(error, verdict.refusal().unwrap());
}

#[test]
fn issue_1764_certified_linear_refuses_the_unrestrained_translation() {
    mechanism_2d("1764", "certified linear", 3);
}

#[test]
fn issue_1648_buckling_refuses_the_unrestrained_translation() {
    mechanism_2d("1648", "buckling", 3);
}

#[test]
fn issue_1359_creep_refuses_the_unrestrained_translation() {
    mechanism_2d("1359", "creep & shrinkage (t = t0)", 5);
}

#[test]
fn issue_1749_a_rigid_link_to_a_dummy_node_cannot_hold_connector_rotations() {
    for fixture in ["1749-false", "1749-true"] {
        let solver: SolverInput = serde_json::from_value(input(fixture)).unwrap();
        let verdict = stability::of_2d(&solver).unwrap();
        assert_eq!(verdict.verdict, Verdict::Singular, "{fixture}: {verdict:?}");
        assert_eq!(
            verdict.reason,
            Reason::ConstraintRounding,
            "{fixture}: {verdict:?}"
        );
        let error =
            linear::solve_2d(&solver).expect_err("a dummy constraint held a connector mechanism");
        assert_eq!(error, verdict.refusal().unwrap(), "{fixture}");
    }
}

#[test]
fn issue_1465_buckling_refuses_a_moment_on_the_released_axis() {
    let solver: SolverInput3D = serde_json::from_value(input("1465")).unwrap();
    let row = ana3::rows()
        .into_iter()
        .find(|a| a.name == "buckling")
        .unwrap();
    let error =
        (row.run)(&Case3::new("replay", solver)).expect_err("a released axis carried its moment");
    assert!(
        error.starts_with("Nodal moment at node 2 is not supported:"),
        "{error}"
    );
    assert!(
        error.contains("loaded released rotation")
            && error.contains("free directions [rx=")
            && error.contains("ry=")
            && error.contains("rz="),
        "{error}"
    );
}

fn support_conflict(issue: &str, analysis: &str, node: usize) {
    let solver: SolverInput3D = serde_json::from_value(input(issue)).unwrap();
    let row = ana3::rows()
        .into_iter()
        .find(|a| a.name == analysis)
        .unwrap();
    let error = (row.run)(&Case3::new("replay", solver))
        .expect_err("a conflicting spring returned a response");
    let error: serde_json::Value = serde_json::from_str(&error).unwrap();
    let diagnostics = error["structuredDiagnostics"].as_array().unwrap();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0]["code"], "conflicting_support_spring");
    assert_eq!(diagnostics[0]["severity"], "error");
    assert_eq!(diagnostics[0]["phase"], "input");
    assert_eq!(diagnostics[0]["nodeIds"], serde_json::json!([node]));
    assert_eq!(diagnostics[0]["dofIndices"], serde_json::json!([0]));
}

#[test]
fn issue_1533_static_refuses_a_spring_on_a_rigid_translation() {
    support_conflict("1533", "linear", 5);
}

#[test]
fn issue_1463_time_history_refuses_a_spring_on_a_rigid_translation() {
    support_conflict("1463", "time history (ground motion)", 11);
}
