use crate::{
    ana2, ana3,
    case::{Case2, Case3},
    corpus,
};
use dedaliano_engine::solver::buckling;
use dedaliano_engine::types::SolverInput3D;
use serde_json::Value;

fn input(key: &str) -> Value {
    let fixtures: Value =
        serde_json::from_str(include_str!("../fixtures/candidate-replay.json")).unwrap();
    fixtures[key].clone()
}

fn refused(issue: u64, analysis: &str, prefix: &str, diagnostic: Option<Value>) {
    let value = input(&format!("{issue}-body-0"));
    let error = match corpus::parse(&value.to_string()).unwrap() {
        corpus::Model::D2(s) => {
            let mut c = Case2::new(value["_nightly_name"].as_str().unwrap_or("replay"), s);
            if let Some(d) = value.get("_nightly_dens") {
                c.dens = serde_json::from_value(d.clone()).unwrap();
            }
            let a = ana2::rows()
                .into_iter()
                .find(|a| a.name == analysis)
                .unwrap();
            (a.run)(&c).expect_err("the reported input returned a result")
        }
        corpus::Model::D3(s) => {
            let mut c = Case3::new(value["_nightly_name"].as_str().unwrap_or("replay"), s);
            if let Some(d) = value.get("_nightly_dens") {
                c.dens = serde_json::from_value(d.clone()).unwrap();
            }
            let a = ana3::rows()
                .into_iter()
                .find(|a| a.name == analysis)
                .unwrap();
            (a.run)(&c).expect_err("the reported input returned a result")
        }
    };
    if let Some(expected) = diagnostic {
        let value: Value = serde_json::from_str(&error).unwrap();
        let actual = value["structuredDiagnostics"].as_array().unwrap();
        assert_eq!(actual.len(), 1);
        for (key, expected_value) in expected.as_object().unwrap() {
            assert_eq!(&actual[0][key], expected_value, "#{issue}: {key}");
        }
    } else {
        assert!(error.starts_with(prefix), "#{issue}: {error}");
    }
}

#[test]
fn issue_1912_refuses_unresolved_stiffness() {
    refused(1912, "linear (WASM typed path)", "the structure is a mechanism or so close to one that its stability cannot be decided in double precision", None);
}

#[test]
fn issue_1908_refuses_unresolved_stiffness() {
    refused(1908, "linear (PCG)", "the structure is a mechanism or so close to one that its stability cannot be decided in double precision at nodes [7, 8, 9, 10, 11, 12, 13, 14, 15, 16]", None);
}

#[test]
fn issue_1906_refuses_unresolved_stiffness() {
    refused(1906, "certified linear", "the structure is a mechanism or so close to one that its stability cannot be decided in double precision", None);
}

#[test]
fn issue_1905_refuses_unresolved_stiffness() {
    refused(1905, "linear (load session)", "the structure is a mechanism or so close to one that its stability cannot be decided in double precision", None);
}

#[test]
fn issue_1903_refuses_unrestrained_translation() {
    refused(1903, "buckling", "the structure is a mechanism at nodes [5]: a node can move freely in a direction no member, support or spring stiffens", None);
}

#[test]
fn issue_1902_refuses_unresolved_stiffness() {
    refused(1902, "linear", "the structure is a mechanism or so close to one that its stability cannot be decided in double precision", None);
}

#[test]
#[ignore = "known wrong result: #1992"]
fn issue_1901_refuses_unresolved_stiffness() {
    refused(1901, "P-Delta", "the structure is a mechanism or so close to one that its stability cannot be decided in double precision", None);
}

#[test]
fn issue_1859_refuses_unrestrained_translation() {
    refused(1859, "P-Delta", "the structure is a mechanism at nodes [2]: a node can move freely in a direction no member, support or spring stiffens", None);
}

#[test]
fn issue_1858_refuses_unresolved_stiffness() {
    refused(1858, "certified linear", "the structure is a mechanism or so close to one that its stability cannot be decided in double precision", None);
}

#[test]
fn issue_1856_refuses_unresolved_stiffness() {
    refused(1856, "linear (WASM typed path)", "the structure is a mechanism or so close to one that its stability cannot be decided in double precision", None);
}

#[test]
fn issue_1852_refuses_unrestrained_translation() {
    refused(1852, "linear (WASM typed path)", "the structure is a mechanism at nodes [2]: a node can move freely in a direction no member, support or spring stiffens", None);
}

#[test]
fn issue_1851_refuses_unresolved_stiffness() {
    refused(1851, "P-Delta", "the structure is a mechanism or so close to one that its stability cannot be decided in double precision", None);
}

#[test]
fn issue_1850_refuses_unrestrained_translation() {
    refused(1850, "linear", "the structure is a mechanism at nodes [2]: a node can move freely in a direction no member, support or spring stiffens", None);
}

#[test]
fn issue_1847_refuses_unrestrained_translation() {
    refused(1847, "linear (load session)", "the structure is a mechanism at nodes [2]: a node can move freely in a direction no member, support or spring stiffens", None);
}

#[test]
fn issue_1842_refuses_unresolved_stiffness() {
    refused(1842, "linear", "the structure is a mechanism or so close to one that its stability cannot be decided in double precision", None);
}

#[test]
fn issue_1800_refuses_conflicting_support_spring() {
    refused(
        1800,
        "linear (WASM typed path)",
        "",
        Some(
            serde_json::json!({"code":"conflicting_support_spring","dofIndices":[1],"message":"Support 2 (node 2): ky contradicts the rigid restraint type=guidedX (uz) on the same DOF. Remove ky to keep it rigid, or release type=guidedX (uz) to use the spring.","nodeIds":[2],"phase":"input","severity":"error"}),
        ),
    );
}

#[test]
fn issue_1799_refuses_conflicting_support_spring() {
    refused(
        1799,
        "certified linear",
        "",
        Some(
            serde_json::json!({"code":"conflicting_support_spring","dofIndices":[1],"message":"Support 2 (node 2): ky contradicts the rigid restraint type=guidedX (uz) on the same DOF. Remove ky to keep it rigid, or release type=guidedX (uz) to use the spring.","nodeIds":[2],"phase":"input","severity":"error"}),
        ),
    );
}

#[test]
fn issue_1798_refuses_conflicting_support_spring() {
    refused(
        1798,
        "modal",
        "",
        Some(
            serde_json::json!({"code":"conflicting_support_spring","dofIndices":[1],"message":"Support 2 (node 2): ky contradicts the rigid restraint type=guidedX (uz) on the same DOF. Remove ky to keep it rigid, or release type=guidedX (uz) to use the spring.","nodeIds":[2],"phase":"input","severity":"error"}),
        ),
    );
}

#[test]
fn issue_1797_refuses_conflicting_support_spring() {
    refused(
        1797,
        "P-Delta",
        "",
        Some(
            serde_json::json!({"code":"conflicting_support_spring","dofIndices":[1],"message":"Support 2 (node 2): ky contradicts the rigid restraint type=guidedX (uz) on the same DOF. Remove ky to keep it rigid, or release type=guidedX (uz) to use the spring.","nodeIds":[2],"phase":"input","severity":"error"}),
        ),
    );
}

#[test]
fn issue_1796_refuses_conflicting_support_spring() {
    refused(
        1796,
        "buckling",
        "",
        Some(
            serde_json::json!({"code":"conflicting_support_spring","dofIndices":[1],"message":"Support 2 (node 2): ky contradicts the rigid restraint type=guidedX (uz) on the same DOF. Remove ky to keep it rigid, or release type=guidedX (uz) to use the spring.","nodeIds":[2],"phase":"input","severity":"error"}),
        ),
    );
}

#[test]
fn issue_1795_refuses_conflicting_support_spring() {
    refused(
        1795,
        "linear (load session)",
        "",
        Some(
            serde_json::json!({"code":"conflicting_support_spring","dofIndices":[0],"message":"Support 2 (node 2): kx contradicts the rigid restraint type=pinned (ux) on the same DOF. Remove kx to keep it rigid, or release type=pinned (ux) to use the spring.","nodeIds":[2],"phase":"input","severity":"error"}),
        ),
    );
}

#[test]
fn issue_1794_refuses_conflicting_support_spring() {
    refused(
        1794,
        "P-Delta",
        "",
        Some(
            serde_json::json!({"code":"conflicting_support_spring","dofIndices":[0],"message":"Support 2 (node 2): kx contradicts the rigid restraint type=pinned (ux) on the same DOF. Remove kx to keep it rigid, or release type=pinned (ux) to use the spring.","nodeIds":[2],"phase":"input","severity":"error"}),
        ),
    );
}

#[test]
fn issue_1793_refuses_conflicting_support_spring() {
    refused(
        1793,
        "linear (WASM typed path)",
        "",
        Some(
            serde_json::json!({"code":"conflicting_support_spring","dofIndices":[0],"message":"Support 2 (node 2): kx contradicts the rigid restraint type=pinned (ux) on the same DOF. Remove kx to keep it rigid, or release type=pinned (ux) to use the spring.","nodeIds":[2],"phase":"input","severity":"error"}),
        ),
    );
}

#[test]
fn issue_1792_refuses_conflicting_support_spring() {
    refused(
        1792,
        "certified linear",
        "",
        Some(
            serde_json::json!({"code":"conflicting_support_spring","dofIndices":[0],"message":"Support 2 (node 2): kx contradicts the rigid restraint type=pinned (ux) on the same DOF. Remove kx to keep it rigid, or release type=pinned (ux) to use the spring.","nodeIds":[2],"phase":"input","severity":"error"}),
        ),
    );
}

#[test]
fn issue_1643_refuses_conflicting_support_spring() {
    refused(
        1643,
        "buckling",
        "",
        Some(
            serde_json::json!({"code":"conflicting_support_spring","dofIndices":[0],"message":"Support 2 (node 4): kx contradicts the rigid restraint type=pinned (ux) on the same DOF. Remove kx to keep it rigid, or release type=pinned (ux) to use the spring.","nodeIds":[4],"phase":"input","severity":"error"}),
        ),
    );
}

#[test]
fn issue_1356_refuses_conflicting_support_spring() {
    refused(
        1356,
        "linear (PCG)",
        "",
        Some(
            serde_json::json!({"code":"conflicting_support_spring","dofIndices":[1],"message":"Support 6 (node 6): ky contradicts the rigid restraint ry on the same DOF. Remove ky to keep it rigid, or release ry to use the spring.","nodeIds":[6],"phase":"input","severity":"error"}),
        ),
    );
}

#[test]
fn issue_1114_refuses_conflicting_support_spring() {
    refused(
        1114,
        "linear (PCG)",
        "",
        Some(
            serde_json::json!({"code":"conflicting_support_spring","dofIndices":[1],"message":"Support 6 (node 6): ky contradicts the rigid restraint ry on the same DOF. Remove ky to keep it rigid, or release ry to use the spring.","nodeIds":[6],"phase":"input","severity":"error"}),
        ),
    );
}

#[test]
fn issue_1111_refuses_conflicting_support_spring() {
    refused(
        1111,
        "staged (one stage)",
        "",
        Some(
            serde_json::json!({"code":"conflicting_support_spring","dofIndices":[1],"message":"Support 2 (node 2): ky contradicts the rigid restraint type=pinned (uz) on the same DOF. Remove ky to keep it rigid, or release type=pinned (uz) to use the spring.","nodeIds":[2],"phase":"input","severity":"error"}),
        ),
    );
}

#[test]
fn issue_1122_correct_buckling_control_keeps_all_requested_modes_in_order() {
    let spec = input("1122-body-0");
    let solver: SolverInput3D = serde_json::from_value(spec["model"].clone()).unwrap();
    let result = buckling::solve_buckling_3d(&solver, 4).unwrap();
    let expected: [f64; 4] = [
        8.90300250228688,
        115.24911946664014,
        215.4994865821472,
        372.91572796828183,
    ];
    assert_eq!(result.modes.len(), expected.len());
    for (mode, reference) in result.modes.iter().zip(expected) {
        let normalized_error = buckling_relative_error(mode.load_factor, reference);
        assert!(
            normalized_error <= 1e-6,
            "{} versus {reference}: {normalized_error}",
            mode.load_factor
        );
    }
}

fn buckling_relative_error(actual: f64, reference: f64) -> f64 {
    (actual - reference).abs() / reference.abs()
}

mod review_checks {
    use super::buckling_relative_error;

    #[test]
    fn silent_witness_audit_rejects_warned_transformed_copy() {
        let status = std::process::Command::new("python3")
            .arg(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../docs/verification/cause-c-replay-audit.py"
            ))
            .arg("--self-test")
            .status()
            .unwrap();
        assert!(status.success());
    }

    #[test]
    fn buckling_budget_is_relative_to_each_mode() {
        for reference in [1.0, 2.0, 4.0, 42.0] {
            for sign in [-1.0, 1.0] {
                assert!(buckling_relative_error(reference * (1.0 + sign * 2e-6), reference) > 1e-6);
                assert!(
                    buckling_relative_error(reference * (1.0 + sign * 0.5e-6), reference) <= 1e-6
                );
                assert_eq!(buckling_relative_error(reference, reference), 0.0);
            }
        }
    }
}

fn reference_1901() -> Value {
    let references: Value = serde_json::from_str(include_str!(
        "../../../docs/verification/candidate-1901-reference.json"
    ))
    .unwrap();
    references[1].clone()
}

fn displacement_1901(node: usize, actual: [f64; 3], reference: &Value) {
    let expected = reference
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["nodeId"] == node)
        .unwrap();
    for (key, actual) in ["ux", "uz", "ry"].into_iter().zip(actual) {
        let expected: f64 = expected[key].as_str().unwrap().parse().unwrap();
        assert!(actual.is_finite());
        assert!(
            (actual - expected).abs() <= 1e-8 * expected.abs().max(1.0),
            "node {node} {key}: {actual} versus independent {expected}"
        );
    }
}

#[test]
#[ignore = "known wrong result: #1992"]
fn issue_1992_1901_linear_reference_and_pdelta_outcome() {
    use dedaliano_engine::{
        metamorphic::planes::{embed_2d, Plane},
        solver::{linear, pdelta},
        types::SolverInput,
    };
    let solver: SolverInput = serde_json::from_value(input("1901-body-0")).unwrap();
    let reference = reference_1901();
    let typed = serde_json::from_value(serde_json::to_value(&solver).unwrap()).unwrap();
    for result in [
        linear::solve_2d(&solver),
        linear::solve_2d_typed(&typed),
        linear::prepare_static_2d(&solver)
            .unwrap()
            .solve_loads(&solver.loads),
        linear::prepare_static_2d_dense_reference(&solver)
            .unwrap()
            .solve_loads(&solver.loads),
    ] {
        let result = result.unwrap();
        assert_eq!(result.displacements.len(), solver.nodes.len());
        for d in &result.displacements {
            displacement_1901(d.node_id, [d.ux, d.uz, d.ry], &reference["linear"]);
        }
    }
    let nonlinear = pdelta::solve_pdelta_2d(&solver, 100, 1e-12).unwrap();
    assert!(!nonlinear.converged && !nonlinear.is_stable);
    assert_eq!(nonlinear.iterations, 100);
    let embeddings: Value =
        serde_json::from_str(include_str!("../fixtures/candidate-1901-embeddings.json")).unwrap();
    for plane in Plane::ALL {
        let embedded = embed_2d(&solver, plane).unwrap();
        assert_eq!(
            serde_json::to_value(&embedded).unwrap(),
            embeddings[format!("{plane:?}")]
        );
        for result in [
            linear::solve_3d(&embedded),
            linear::prepare_static_3d(&embedded)
                .unwrap()
                .solve_loads(&embedded.loads),
        ] {
            let result = result.unwrap();
            assert_eq!(result.displacements.len(), solver.nodes.len());
            for d in &result.displacements {
                let project =
                    |a: [f64; 3], b: [f64; 3]| a.into_iter().zip(b).map(|(a, b)| a * b).sum();
                displacement_1901(
                    d.node_id,
                    [
                        project([d.ux, d.uy, d.uz], plane.e1()),
                        project([d.ux, d.uy, d.uz], plane.e2()),
                        project([d.rx, d.ry, d.rz], plane.normal()),
                    ],
                    &reference["linear"],
                );
            }
        }
        let nonlinear = pdelta::solve_pdelta_3d(&embedded, 100, 1e-12).unwrap();
        assert!(nonlinear.converged);
        for d in &nonlinear.results.displacements {
            let project = |a: [f64; 3], b: [f64; 3]| a.into_iter().zip(b).map(|(a, b)| a * b).sum();
            displacement_1901(
                d.node_id,
                [
                    project([d.ux, d.uy, d.uz], plane.e1()),
                    project([d.ux, d.uy, d.uz], plane.e2()),
                    project([d.rx, d.ry, d.rz], plane.normal()),
                ],
                &reference["pdelta"]["displacements"],
            );
        }
    }
    refused(1901, "P-Delta", "the structure is a mechanism or so close to one that its stability cannot be decided in double precision", None);
}
