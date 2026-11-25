use crate::{ana3, case::Case3, checks2::hash, checks3::rotation_for};
use dedaliano_engine::certify::modal::{certify_modal_2d, certify_modal_3d};
use dedaliano_engine::metamorphic::{relabel::Relabel, Rng};
use dedaliano_engine::solver::modal::{solve_modal_2d, solve_modal_3d};
use dedaliano_engine::types::{SolverInput, SolverInput3D};
use serde_json::{json, Value};
use std::collections::HashMap;

const PHYSICAL_NULL: &str = "MODAL-MECHANISM: Modal analysis: the constrained physical stiffness";
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
        Err(error) => assert!(
            error.starts_with(PHYSICAL_NULL)
                && error.contains(&format!("moves node {node} along u")),
            "{error}"
        ),
    }
}

fn issue_case(seed: u64, certified: bool, relabel: bool) {
    let value: Value = serde_json::from_str(FIXTURE).unwrap();
    let input: SolverInput3D = serde_json::from_value(value.clone()).unwrap();
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
            json!({"refusal":PHYSICAL_NULL,"node":node}),
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
#[ignore = "known wrong result: #2146"]
fn issue_2146_certified_modal_rotation() {
    issue_case(20772, true, false);
}

#[test]
#[ignore = "known wrong result: #2147"]
fn issue_2147_modal_relabel() {
    issue_case(20772, false, true);
}

#[test]
#[ignore = "known wrong result: #2148"]
fn issue_2148_modal_rotation() {
    issue_case(20772, false, false);
}

#[test]
#[ignore = "known wrong result: #2416"]
fn issue_2416_certified_modal_rotation() {
    issue_case(20778, true, false);
}

#[test]
#[ignore = "known wrong result: #2517"]
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
            "2":{"id":2,"nodeId":2,"type":"spring","kz":transverse_stiffness}
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
#[ignore = "known wrong result: #2148"]
fn planar_dense_and_sparse_modal_refuse_a_massive_null() {
    for padding in [0, 22] {
        let input = planar(padding, 1.0, 0.0, true);
        let densities = HashMap::new();
        for api in ["solve_modal_2d", "certify_modal_2d"] {
            record_case(
                api,
                1,
                &input,
                &densities,
                json!({"refusal":PHYSICAL_NULL,"node":2}),
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
    for padding in [0, 22] {
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
    for padding in [0, 22] {
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
