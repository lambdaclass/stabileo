use crate::{ana3, case::Case3, checks2::hash, checks3::rotation_for};
use dedaliano_engine::certify::modal::{certify_modal_2d, certify_modal_3d};
use dedaliano_engine::metamorphic::{planes::{embed_2d, Plane}, relabel::Relabel, Rng};
use dedaliano_engine::solver::modal::{solve_modal_2d, solve_modal_3d};
use dedaliano_engine::types::{SolverInput, SolverInput3D};
use serde_json::{json, Value};
use std::collections::HashMap;

const PHYSICAL_NULL: &str = "Modal analysis: the constrained physical stiffness";
const TRANSLATION_MECHANISM_CODE: &str = "modal_translation_mechanism";
const FIXTURE: &str = include_str!("../fixtures/modal-null-21650.json");

fn record_case(
    api: &str,
    count: usize,
    solver: &impl serde::Serialize,
    densities: &HashMap<String, f64>,
    expected: Value,
) {
    let Ok(path) = std::env::var("MODAL_NULL_WASM_CASES") else {
        return;
    };
    use std::io::Write;
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = LOCK.lock().unwrap();
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .unwrap();
    let case = json!({"api":api,"count":count,"input":{"solver":solver,"densities":densities},"expected":expected});
    writeln!(file, "{case}").unwrap();
}

fn translation_mechanism(error: &str) -> Value {
    let payload: Value = serde_json::from_str(error.strip_prefix("MODAL-MECHANISM: ")
        .unwrap_or_else(|| panic!("{error}"))).unwrap_or_else(|_| panic!("{error}"));
    let diagnostic = &payload["structuredDiagnostics"][0];
    assert_eq!(diagnostic["code"], TRANSLATION_MECHANISM_CODE, "{error}");
    assert_eq!(diagnostic["severity"], "error", "{error}");
    assert!(payload["message"].as_str().unwrap().starts_with(PHYSICAL_NULL), "{error}");
    diagnostic.clone()
}

fn assert_null(result: Result<Value, String>, node: usize) {
    match result {
        Ok(value) => {
            let fundamental = if value.get("results").is_some() {
                &value["results"]
            } else {
                &value
            };
            panic!(
                "node {node} can translate without stiffness, accepted first ω = {}",
                fundamental["modes"][0]["omega"]
            );
        }
        Err(error) => {
            let diagnostic = translation_mechanism(&error);
            assert_eq!(diagnostic["nodeIds"], json!([node]), "{error}");
            assert!(error.contains(&format!("has a mechanism at node {node} (dominant component: u")), "{error}");
        }
    }
}

fn issue_case(seed: u64, certified: bool, relabel: bool) {
    let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
    crate::common::take_nightly_metadata(&mut value);
    let input: SolverInput3D = serde_json::from_value(value.clone()).unwrap();
    let value: Value = serde_json::from_str(FIXTURE).unwrap();
    let mut base = Case3::new(value["_nightly_name"].as_str().unwrap(), input);
    base.dens = serde_json::from_value(value["_nightly_dens"].clone()).unwrap();
    let name = if certified {
        "certified modal"
    } else {
        "modal"
    };
    let row = ana3::rows()
        .into_iter()
        .find(|row| row.name == name)
        .unwrap();
    let mut rng = Rng::new(seed ^ hash(&base.name) ^ hash(name) ^ 0x3d);
    let (transformed, transformed_node) = if relabel {
        let seed = rng.next_u64();
        let relabel = Relabel::random_3d(&base.s, seed);
        (base.relabel(&relabel, seed), relabel.n(4))
    } else {
        let iso = rotation_for(&row, &mut rng);
        let transformed = base
            .iso(&iso)
            .or_else(|_| {
                use dedaliano_engine::metamorphic::transform::Iso3;
                let fallback = Iso3::axis_permutation(1 + rng.below(23)).translated([
                    rng.range(-40.0, 40.0),
                    rng.range(-40.0, 40.0),
                    rng.range(-40.0, 40.0),
                ]);
                base.iso(&fallback)
            })
            .unwrap();
        (transformed, 4)
    };
    for (case, node) in [(base, 4), (transformed, transformed_node)] {
        let api = if certified {
            "certify_modal_3d"
        } else {
            "solve_modal_3d"
        };
        record_case(
            api,
            6,
            &case.s,
            &case.dens,
            json!({"refusal":PHYSICAL_NULL,"node":node,"code":TRANSLATION_MECHANISM_CODE}),
        );
        let result = if certified {
            certify_modal_3d(&case.s, &case.dens, 6).map(|r| serde_json::to_value(r).unwrap())
        } else {
            solve_modal_3d(&case.s, &case.dens, 6).map(|r| serde_json::to_value(r).unwrap())
        };
        assert_null(result, node);
    }
}

#[test]
fn issue_2146_certified_modal_rotation() {
    issue_case(20772, true, false);
}

#[test]
fn issue_2147_modal_relabel() {
    issue_case(20772, false, true);
}

#[test]
fn issue_2148_modal_rotation() {
    issue_case(20772, false, false);
}

#[test]
fn issue_2416_certified_modal_rotation() {
    issue_case(20778, true, false);
}

#[test]
fn issue_2517_certified_modal_rotation() {
    issue_case(20781, true, false);
}

fn planar(
    padding: usize,
    transverse_mass: f64,
    transverse_stiffness: f64,
    skew: bool,
) -> SolverInput {
    let mut model = json!({
        "nodes": {
            "1": {"id":1,"x":0.0,"z":0.0},
            "2": {"id":2,"x":3.0,"z":if skew {4.0} else {0.0}}
        },
        "elements": {"1":{"id":1,"type":"truss","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1}},
        "materials": {"1":{"id":1,"e":1.0,"nu":0.3}},
        "sections": {"1":{"id":1,"a":1.0,"iz":1.0}},
        "supports": {
            "1":{"id":1,"nodeId":1,"type":"fixed"},
            "2":{"id":2,"nodeId":2,"type":"spring","ky":transverse_stiffness}
        },
        "loads": [],
        "masses": {"nodal":[{"nodeId":2,"massX":1.0,"massZ":transverse_mass}]}
    });
    for index in 0..padding {
        let id = index + 3;
        let key = id.to_string();
        model["nodes"][&key] = json!({"id":id,"x":id as f64,"z":0.0});
        model["supports"][&key] =
            json!({"id":id,"nodeId":id,"type":"spring","kx":1.0,"ky":1.0,"kz":1.0});
    }
    serde_json::from_value(model).unwrap()
}

#[test]
fn planar_dense_and_sparse_modal_refuse_a_massive_null() {
    for padding in [0, 32] {
        let input = planar(padding, 1.0, 0.0, true);
        let densities = HashMap::new();
        for api in ["solve_modal_2d", "certify_modal_2d"] {
            record_case(
                api,
                1,
                &input,
                &densities,
                json!({"refusal":PHYSICAL_NULL,"node":2,"code":TRANSLATION_MECHANISM_CODE}),
            );
        }
        assert_null(
            solve_modal_2d(&input, &densities, 1).map(|r| serde_json::to_value(r).unwrap()),
            2,
        );
        assert_null(
            certify_modal_2d(&input, &densities, 1).map(|r| serde_json::to_value(r).unwrap()),
            2,
        );
    }
}

#[test]
fn planar_massless_null_preserves_the_existing_singular_refusal() {
    for padding in [0, 32] {
        let input = planar(padding, 0.0, 0.0, false);
        let densities = HashMap::new();
        for api in ["solve_modal_2d", "certify_modal_2d"] {
            record_case(
                api,
                1,
                &input,
                &densities,
                json!({"refusal":"Eigenvalue decomposition failed"}),
            );
        }
        for error in [
            solve_modal_2d(&input, &densities, 1).unwrap_err(),
            certify_modal_2d(&input, &densities, 1).unwrap_err(),
        ] {
            assert!(error.contains("Eigenvalue decomposition failed"), "{error}");
        }
    }
}

#[test]
fn planar_positive_transverse_stiffness_keeps_the_finite_modes() {
    for padding in [0, 32] {
        let stiffness = 0.125;
        let input = planar(padding, 1.0, stiffness, false);
        let densities = HashMap::new();
        for api in ["solve_modal_2d", "certify_modal_2d"] {
            record_case(
                api,
                2,
                &input,
                &densities,
                json!({"modes":2,"nulls":0,"omegaSquared":stiffness}),
            );
        }
        let raw = solve_modal_2d(&input, &densities, 2).unwrap();
        let certified = certify_modal_2d(&input, &densities, 2).unwrap();
        assert_eq!(raw.modes.len(), 2);
        assert!(raw.null_modes.is_empty());
        assert!((raw.modes[0].omega.powi(2) / stiffness - 1.0).abs() < 1e-12);
        assert_eq!(raw.modes[0].omega, certified.results.modes[0].omega);
    }
}

#[test]
fn spatial_released_rotation_keeps_the_reported_null_and_replaces_its_mode() {
    let input: SolverInput3D = serde_json::from_value(json!({
        "nodes": {
            "1": {"id":1,"x":0.0,"y":0.0,"z":0.0},
            "2": {"id":2,"x":0.13,"y":0.07,"z":3.0}
        },
        "materials": {"1": {"id":1,"e":200_000.0,"nu":0.3}},
        "sections": {"1": {"id":1,"a":0.01,"iy":2e-4,"iz":1e-4,"j":5e-5}},
        "elements": {"1": {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1,"releaseTStart":true}},
        "supports": {"1": {"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}},
        "loads": [],
        "masses": {"nodal":[{"nodeId":2,"mass":0.0,"ixx":0.1,"iyy":0.1,"izz":0.1}]}
    })).unwrap();
    let densities = HashMap::from([("1".into(), 7.85)]);
    for api in ["solve_modal_3d", "certify_modal_3d"] {
        record_case(api, 1, &input, &densities, json!({"modes":1,"nulls":1}));
    }
    let raw = solve_modal_3d(&input, &densities, 1).unwrap();
    let certified = certify_modal_3d(&input, &densities, 1).unwrap();
    assert_eq!(raw.modes.len(), 1);
    assert_eq!(raw.null_modes.len(), 1);
    assert_eq!(raw.null_modes[0].node_id, 2);
    assert!(raw.null_modes[0].dof.starts_with('r'));
    assert_eq!(
        serde_json::to_value(raw).unwrap(),
        serde_json::to_value(certified.results).unwrap()
    );
}

#[test]
fn planar_constraint_that_blocks_the_null_translation_keeps_the_axial_mode() {
    let mut input = planar(0, 1.0, 0.0, false);
    input.constraints = serde_json::from_value(json!([
        {"type":"equalDOF","masterNode":1,"slaveNode":2,"dofs":[1]}
    ]))
    .unwrap();
    let densities = HashMap::new();
    let omega_squared = 1000.0 / 3.0;
    for api in ["solve_modal_2d", "certify_modal_2d"] {
        record_case(
            api,
            1,
            &input,
            &densities,
            json!({"modes":1,"nulls":0,"omegaSquared":omega_squared}),
        );
    }
    let raw = solve_modal_2d(&input, &densities, 1).unwrap();
    let certified = certify_modal_2d(&input, &densities, 1).unwrap();
    assert_eq!(raw.modes.len(), 1);
    assert!(raw.null_modes.is_empty());
    assert!((raw.modes[0].omega.powi(2) / omega_squared - 1.0).abs() < 1e-12);
    assert_eq!(raw.modes[0].omega, certified.results.modes[0].omega);
}

#[test]
fn spatial_independent_spring_restores_modes_on_the_issue_model() {
    let mut model: Value = serde_json::from_str(FIXTURE).unwrap();
    let densities = serde_json::from_value(model["_nightly_dens"].clone()).unwrap();
    model["supports"]["4"]["ky"] = model["supports"]["4"]["kx"].clone();
    crate::common::take_nightly_metadata(&mut model);
    let input: SolverInput3D = serde_json::from_value(model).unwrap();
    for api in ["solve_modal_3d", "certify_modal_3d"] {
        record_case(api, 6, &input, &densities, json!({"modes":6,"nulls":0}));
    }
    let raw = solve_modal_3d(&input, &densities, 6).unwrap();
    let certified = certify_modal_3d(&input, &densities, 6).unwrap();
    assert_eq!(raw.modes.len(), 6);
    assert!(raw.null_modes.is_empty());
    assert!(raw.modes.iter().all(|mode| mode.omega > 0.0));
    assert_eq!(
        serde_json::to_value(raw).unwrap(),
        serde_json::to_value(certified.results).unwrap()
    );
}

fn check_2d_review_case(input: &SolverInput, expected: Value) {
    let densities = HashMap::new();
    for api in ["solve_modal_2d", "certify_modal_2d"] {
        record_case(api, 1, input, &densities, expected.clone());
    }
    let raw = solve_modal_2d(input, &densities, 1).map(|r| json!(r));
    let certified = certify_modal_2d(input, &densities, 1).map(|r| json!(r.results));
    check_review_case(raw, &expected);
    check_review_case(certified, &expected);
}

fn check_3d_review_case(input: &SolverInput3D, expected: Value) {
    let densities = HashMap::new();
    for api in ["solve_modal_3d", "certify_modal_3d"] {
        record_case(api, 1, input, &densities, expected.clone());
    }
    let raw = solve_modal_3d(input, &densities, 1).map(|r| json!(r));
    let certified = certify_modal_3d(input, &densities, 1).map(|r| json!(r.results));
    check_review_case(raw, &expected);
    check_review_case(certified, &expected);
}

fn check_review_case(result: Result<Value, String>, expected: &Value) {
    if let Some(refusal) = expected["refusal"].as_str() {
        let error = result.unwrap_err();
        if expected["code"] == TRANSLATION_MECHANISM_CODE {
            let diagnostic = translation_mechanism(&error);
            if !expected["component"].is_null() {
                assert_eq!(diagnostic["dofIndices"], json!([expected["component"]]), "{error}");
                assert_eq!(diagnostic["nodeIds"], json!([2]), "{error}");
            }
        } else if let Some(code) = expected["code"].as_str() {
            let payload: Value = serde_json::from_str(&error).unwrap_or_else(|_| panic!("{error}"));
            assert_eq!(payload["structuredDiagnostics"][0]["code"], code, "{error}");
            assert_eq!(payload["structuredDiagnostics"][0]["severity"], "error", "{error}");
            assert!(payload["message"].as_str().unwrap().starts_with(refusal), "{error}");
        } else if expected["legacyEigenFailure"].as_bool() == Some(true) {
            assert!(error.contains(refusal), "{error}");
        } else {
            assert!(error.starts_with(refusal), "{error}");
        }
        if let Some(detail) = expected["detail"].as_str() {
            assert!(error.contains(detail), "{error}");
        }
    } else {
        let result = result.unwrap();
        assert_eq!(result["modes"].as_array().unwrap().len(), 1);
        assert_eq!(result["nullModes"].as_array().map_or(0, Vec::len), 0);
        let omega = result["modes"][0]["omega"].as_f64().unwrap();
        assert!(omega > 0.0);
        if let Some(analytic) = expected["omegaSquared"].as_f64() {
            assert!((omega.powi(2) / analytic - 1.0).abs() < 1e-12, "{omega}² vs {analytic}");
        }
    }
}

#[test]
fn review_tied_translation_survives_stiffness_cancellation() {
    let null = json!({"refusal":PHYSICAL_NULL,"code":TRANSLATION_MECHANISM_CODE});
    for padding in [0, 32] {
        let mut value = json!(planar(padding, 0.0, 0.0, false));
        value["nodes"]["2"]["x"] = json!(1.0);
        value["nodes"]["100"] = json!({"id":100,"x":2.0,"z":0.0});
        value["materials"]["1"]["e"] = json!(0.001);
        value["materials"]["2"] = json!({"id":2,"e":0.0001,"nu":0.3});
        value["elements"]["2"] =
            json!({"id":2,"type":"truss","nodeI":2,"nodeJ":100,"materialId":2,"sectionId":1});
        for id in [1, 2, 100] {
            value["supports"][id.to_string()] = json!({"id":id,"nodeId":id,"type":"guidedX"});
        }
        let ties = json!([
            {"type":"equalDOF","masterNode":1,"slaveNode":2,"dofs":[0]},
            {"type":"equalDOF","masterNode":1,"slaveNode":100,"dofs":[0]}
        ]);
        for stiffness in [0.0, 0.25] {
            value["supports"]["1"]["kx"] = json!(stiffness);
            let mut input: SolverInput = serde_json::from_value(value.clone()).unwrap();
            let mut spatial = embed_2d(&input, Plane::ALL[0]).unwrap();
            input.constraints = serde_json::from_value(ties.clone()).unwrap();
            spatial.constraints = serde_json::from_value(ties.clone()).unwrap();
            let expected = if stiffness == 0.0 {
                null.clone()
            } else {
                json!({"modes":1,"nulls":0,"omegaSquared":stiffness})
            };
            check_2d_review_case(&input, expected.clone());
            if padding == 0 {
                check_3d_review_case(&spatial, expected);
            }
        }
    }
}

#[test]
fn review_rank_one_mass_detects_a_resolved_small_projection() {
    let null = json!({"refusal":PHYSICAL_NULL,"code":TRANSLATION_MECHANISM_CODE});
    for padding in [0, 32] {
        let mut value = json!(planar(padding, 0.0, 1.0, false));
        value["elements"] = json!({});
        value["supports"]["1"] = json!({"id":1,"nodeId":1,"type":"guidedX"});
        value["supports"]["2"]["kz"] = json!(1.0);
        value["masses"]["nodal"] = json!([{"nodeId":1,"massX":1.0}]);
        for (coefficient, stiffness) in [(5e-15, 0.0), (0.0, 0.0), (5e-15, 1.0), (0.0, 1.0)] {
            value["supports"]["2"]["kx"] = json!(stiffness);
            let tie = |axis| json!([{"type":"linearMPC","terms":[
                {"nodeId":2,"dof":0,"coefficient":-coefficient},
                {"nodeId":2,"dof":axis,"coefficient":-1.0},
                {"nodeId":1,"dof":0,"coefficient":1.0}
            ]}]);
            let mut input: SolverInput = serde_json::from_value(value.clone()).unwrap();
            let mut spatial = embed_2d(&input, Plane::ALL[0]).unwrap();
            input.constraints = serde_json::from_value(tie(1)).unwrap();
            spatial.constraints = serde_json::from_value(tie(2)).unwrap();
            let expected = match (coefficient, stiffness) {
                (0.0, 0.0) => json!({"refusal":"Eigenvalue decomposition failed","legacyEigenFailure":true}),
                (_, 0.0) => null.clone(),
                _ => json!({"modes":1,"nulls":0,"omegaSquared":1.0 / (1.0 + coefficient * coefficient)}),
            };
            check_2d_review_case(&input, expected.clone());
            if padding == 0 {
                check_3d_review_case(&spatial, expected);
            }
        }
    }
}

#[test]
fn review_skewed_weak_spring_is_distinct_from_a_null_translation() {
    for padding in [0, 32] {
        for stiffness in [1.0, 4.0, 0.0] {
            let mut input = planar(padding, 1.0, stiffness, true);
            let tip = input.nodes.get_mut("2").unwrap();
            tip.x = 1.0;
            tip.z = 1.0;
            let axial = 1e14;
            input.materials.get_mut("1").unwrap().e = axial * 2.0_f64.sqrt() / 1000.0;
            let omega_squared = axial * stiffness / (axial + stiffness + axial.hypot(stiffness));
            let expected = match stiffness {
                0.0 => json!({"refusal":PHYSICAL_NULL,"code":TRANSLATION_MECHANISM_CODE}),
                1.0 => json!({"refusal":"Modal analysis: stiffness conditioning","code":"modal_stiffness_conditioning"}),
                _ => json!({"modes":1,"nulls":0,"omegaSquared":omega_squared}),
            };
            check_2d_review_case(&input, expected.clone());
            if padding == 0 {
                let spatial = embed_2d(&input, Plane::ALL[0]).unwrap();
                check_3d_review_case(&spatial, expected);
            }
        }
    }
}

#[test]
fn review_one_detected_mechanism_reports_its_dominant_component() {
    let expected =
        json!({"refusal":PHYSICAL_NULL,"code":TRANSLATION_MECHANISM_CODE,"node":2,"component":0,"detail":"has a mechanism at node 2 (dominant component: ux)"});
    for padding in [0, 32] {
        for pin_ended in [false, true] {
            let mut input = planar(padding, 1.0, 0.0, true);
            if pin_ended {
                let element = input.elements.get_mut("1").unwrap();
                element.elem_type = "frame".into();
                element.hinge_start = true;
                element.hinge_end = true;
            }
            check_2d_review_case(&input, expected.clone());
            if padding == 0 {
                let spatial = embed_2d(&input, Plane::ALL[0]).unwrap();
                check_3d_review_case(&spatial, expected.clone());
            }
        }
    }
    let spatial: SolverInput3D = serde_json::from_value(json!({
        "nodes": {
            "1":{"id":1,"x":0.0,"y":0.0,"z":0.0},
            "2":{"id":2,"x":0.0,"y":1.0,"z":0.0}
        },
        "elements":{"1":{"id":1,"type":"truss","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1}},
        "materials":{"1":{"id":1,"e":1.0,"nu":0.3}},
        "sections":{"1":{"id":1,"a":1.0,"iy":1.0,"iz":1.0,"j":1.0}},
        "supports":{"1":{"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}},
        "masses":{"nodal":[{"nodeId":2,"mass":1.0}]},
        "loads":[]
    })).unwrap();
    check_3d_review_case(&spatial, expected);
}
