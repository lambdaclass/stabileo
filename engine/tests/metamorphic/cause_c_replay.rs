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
    mechanism_nodes_2d(issue, analysis, &[node]);
}

fn mechanism_nodes_2d(issue: &str, analysis: &str, nodes: &[usize]) {
    let solver: SolverInput = serde_json::from_value(input(issue)).unwrap();
    let verdict = stability::of_2d(&solver).unwrap();
    assert_eq!(verdict.verdict, Verdict::Mechanism);
    assert_eq!(verdict.reason, Reason::FreeTranslation);
    assert_eq!(verdict.mode_nodes, nodes);
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

fn support_conflict_model(solver: SolverInput3D, analysis: &str, node: usize) {
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

fn support_conflict(issue: &str, analysis: &str, node: usize) {
    support_conflict_model(serde_json::from_value(input(issue)).unwrap(), analysis, node);
}

#[test]
fn issue_1533_static_refuses_a_spring_on_a_rigid_translation() {
    support_conflict("1533", "linear", 5);
}

#[test]
#[ignore = "known wrong result: #2009"]
fn issue_1463_time_history_refuses_a_spring_on_a_rigid_translation() {
    let solver: SolverInput3D = serde_json::from_value(input("1463")).unwrap();
    for analysis in ["time history", "time history (ground motion)"] {
        support_conflict_model(solver.clone(), analysis, 11);
        let mut motion_only = solver.clone();
        for s in motion_only.supports.values_mut() {
            for (rigid, spring) in [(s.rx, &mut s.kx), (s.ry, &mut s.ky), (s.rz, &mut s.kz),
                (s.rrx, &mut s.krx), (s.rry, &mut s.kry), (s.rrz, &mut s.krz)] {
                if rigid { *spring = None; }
            }
        }
        let row = ana3::rows().into_iter().find(|a| a.name == analysis).unwrap();
        let error = (row.run)(&Case3::new("prescribed motion", motion_only.clone())).unwrap_err();
        let error: serde_json::Value = serde_json::from_str(&error).unwrap();
        assert_eq!(error["structuredDiagnostics"][0]["code"], "unsupported_feature");
        assert!(error["message"].as_str().unwrap().contains("prescribed support displacements"));
        for s in motion_only.supports.values_mut() {
            s.dx = Some(0.0); s.dy = Some(0.0); s.dz = Some(0.0);
            s.drx = Some(0.0); s.dry = Some(0.0); s.drz = Some(0.0);
        }
        (row.run)(&Case3::new("zero prescribed motion", motion_only)).unwrap();
    }
}

#[test]
fn issue_1202_buckling_refuses_the_unrestrained_translation() {
    mechanism_2d("1202", "buckling", 2);
}

#[test]
fn issue_1110_buckling_refuses_the_unrestrained_translation() {
    mechanism_2d("1110", "buckling", 2);
}

#[test]
fn issue_1103_creep_refuses_both_unrestrained_translations() {
    mechanism_nodes_2d("1103", "creep & shrinkage (t = t0)", &[2, 7]);
}

#[test]
fn issue_1099_sparse_linear_refuses_the_connector_rotation_mechanism() {
    let solver: SolverInput = serde_json::from_value(input("1099")).unwrap();
    let row = ana2::rows()
        .into_iter()
        .find(|a| a.name == "linear (sparse path)")
        .unwrap();
    let error = (row.run)(&Case2::new("replay", solver))
        .expect_err("the connector rotation mechanism returned a response");
    assert!(
        error.starts_with("Connector 1: the rotations of node(s) 2, 3"),
        "{error}"
    );
    assert!(
        error.contains("leave a combination of them with no stiffness, a mechanism"),
        "{error}"
    );
}

#[test]
fn issue_1095_modal_refuses_the_free_translation_without_dropping_its_mode() {
    let solver: SolverInput = serde_json::from_value(input("1095")).unwrap();
    let verdict = stability::of_2d(&solver).unwrap();
    assert_eq!(verdict.verdict, Verdict::Mechanism);
    assert_eq!(verdict.reason, Reason::FreeTranslation);
    assert_eq!(verdict.mode_nodes, vec![3]);
    for analysis in ["modal", "certified modal"] {
        let row = ana2::rows()
            .into_iter()
            .find(|a| a.name == analysis)
            .unwrap();
        let error = (row.run)(&Case2::new("replay", solver.clone()))
            .expect_err("a modal result omitted the mechanism mode");
        assert!(error.starts_with("MODAL-MECHANISM:"), "{analysis}: {error}");
        assert!(
            error.contains("moves node 3 along ux") && error.contains("No modes are returned"),
            "{analysis}: {error}"
        );
    }
}

#[test]
fn issue_1028_cable_refuses_a_spring_on_a_rigid_translation() {
    let solver: SolverInput = serde_json::from_value(input("1028")).unwrap();
    let row = ana2::rows()
        .into_iter()
        .find(|a| a.name == "cable solver")
        .unwrap();
    let error = (row.run)(&Case2::new("replay", solver))
        .expect_err("a conflicting spring returned a cable result");
    let error: serde_json::Value = serde_json::from_str(&error).unwrap();
    let diagnostics = error["structuredDiagnostics"].as_array().unwrap();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0]["code"], "conflicting_support_spring");
    assert_eq!(diagnostics[0]["severity"], "error");
    assert_eq!(diagnostics[0]["phase"], "input");
    assert_eq!(diagnostics[0]["nodeIds"], serde_json::json!([5]));
    assert_eq!(diagnostics[0]["dofIndices"], serde_json::json!([0]));
}

#[test]
fn issue_966_buckling_refuses_the_unrestrained_translation() {
    mechanism_2d("966", "buckling", 2);
}

#[test]
fn issue_965_creep_refuses_the_unrestrained_translation() {
    mechanism_2d("965", "creep & shrinkage (t = t0)", 2);
}

#[test]
fn issue_959_buckling_refuses_compression_recovered_only_from_roundoff() {
    let solver: SolverInput = serde_json::from_value(input("959")).unwrap();
    let row = ana2::rows()
        .into_iter()
        .find(|a| a.name == "buckling")
        .unwrap();
    let error = (row.run)(&Case2::new("replay", solver))
        .expect_err("transverse loading produced a buckling factor from roundoff compression");
    assert!(
        error.starts_with("Buckling not determinable: every axial compression is within round-off"),
        "{error}"
    );
    assert!(
        error.contains("element 1") && error.contains("resolvable beyond"),
        "{error}"
    );
}

#[test]
fn issue_758_public_plastic_refuses_the_rigid_link_renumbering_witness() {
    let solver: SolverInput = serde_json::from_value(input("758")).unwrap();
    let row = ana2::rows()
        .into_iter()
        .find(|a| a.name == "plastic collapse")
        .unwrap();
    let error = (row.run)(&Case2::new("replay", solver))
        .expect_err("the contained 2D plastic defect returned a factor");
    let error: serde_json::Value = serde_json::from_str(&error).unwrap();
    let diagnostics = error["structuredDiagnostics"].as_array().unwrap();
    let diagnostic = diagnostics
        .iter()
        .find(|d| d["phase"] == "PL-2D-INVARIANCE")
        .unwrap();
    assert_eq!(diagnostic["code"], "known_issue");
    assert_eq!(diagnostic["severity"], "error");
    assert_eq!(diagnostic["value"], 758.0);
}

#[test]
fn issue_741_certified_buckling_refuses_the_original_roundoff_compression() {
    let solver: SolverInput3D = serde_json::from_value(input("741")).unwrap();
    let error = dedaliano_engine::certify::buckling::certify_buckling_3d(&solver, 3)
        .expect_err("the original fuzz witness received a certified buckling factor");
    assert!(error.starts_with("Buckling not determinable:"), "{error}");
    assert!(
        error.contains("element 3") && error.contains("round-off"),
        "{error}"
    );
}

#[test]
fn issue_818_buckling_refuses_the_original_741_roundoff_factor() {
    let solver: SolverInput3D = serde_json::from_value(input("741")).unwrap();
    let error = dedaliano_engine::solver::buckling::solve_buckling_3d(&solver, 3)
        .expect_err("the original fuzz witness returned its inaccurate factor");
    assert!(error.starts_with("Buckling not determinable:"), "{error}");
    assert!(
        error.contains("element 3") && error.contains("round-off"),
        "{error}"
    );
}

#[test]
fn issue_458_certified_linear_refuses_the_concurrent_inclined_rollers() {
    let solver: SolverInput = serde_json::from_value(input("458-rollers")).unwrap();
    let verdict = stability::of_2d(&solver).unwrap();
    assert_eq!(verdict.verdict, Verdict::Singular);
    assert_eq!(verdict.reason, Reason::Conditioning);
    assert_eq!(verdict.mode_nodes, vec![1, 2]);
    let error = dedaliano_engine::certify::certify_linear_2d_full(&solver)
        .expect_err("concurrent inclined rollers received a certificate");
    assert_eq!(error, verdict.refusal().unwrap());
}
