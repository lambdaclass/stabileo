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
        let normalized_error = (mode.load_factor - reference).abs()
            / reference.abs()
            / (reference / expected[0]).abs().max(1.0);
        assert!(
            normalized_error <= 1e-6,
            "{} versus {reference}: {normalized_error}",
            mode.load_factor
        );
    }
}
