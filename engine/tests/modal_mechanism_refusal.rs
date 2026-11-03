use dedaliano_engine::solver::modal::{solve_modal_2d, solve_modal_3d};
use dedaliano_engine::types::*;
use serde_json::{json, Map};
use std::collections::HashMap;

fn densities() -> HashMap<String, f64> {
    HashMap::from([("1".to_string(), 7.85)])
}

fn column_with_hinged_arm_3d(segments: usize, hinged: bool) -> SolverInput3D {
    let mut nodes = Map::new();
    let mut elements = Map::new();
    let h = 3.0;
    for i in 0..=segments {
        nodes.insert((i + 1).to_string(), json!({"id": i + 1, "x": 0.1 * i as f64 / segments as f64, "y": 0.0, "z": h * i as f64 / segments as f64}));
        if i > 0 {
            elements.insert(i.to_string(), json!({"id": i, "type": "frame", "nodeI": i, "nodeJ": i + 1, "materialId": 1, "sectionId": 1}));
        }
    }
    let (top, tip, arm) = (segments + 1, segments + 2, segments + 1);
    nodes.insert(tip.to_string(), json!({"id": tip, "x": 1.3, "y": 0.7, "z": h + 0.4}));
    elements.insert(arm.to_string(), json!({"id": arm, "type": "frame", "nodeI": top, "nodeJ": tip, "materialId": 1, "sectionId": 1,
        "releaseMyStart": hinged}));
    serde_json::from_value(json!({
        "nodes": nodes,
        "materials": {"1": {"id": 1, "e": 200_000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 2e-4, "iz": 1e-4, "j": 5e-5}},
        "elements": elements,
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
        "loads": [],
        "masses": {"nodal": [{"nodeId": top, "mass": 1.0}, {"nodeId": tip, "mass": 0.5}]},
    }))
    .unwrap()
}

fn column_with_hinged_arm_2d(hinged: bool) -> SolverInput {
    serde_json::from_value(json!({
        "nodes": {
            "1": {"id": 1, "x": 0.0, "z": 0.0},
            "2": {"id": 2, "x": 0.0, "z": 3.0},
            "3": {"id": 3, "x": 1.7, "z": 3.6},
        },
        "materials": {"1": {"id": 1, "e": 200_000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1, "hingeStart": hinged, "hingeEnd": false},
        },
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
        "loads": [],
    }))
    .unwrap()
}

fn refusal(result: Result<Vec<f64>, String>, what: &str) -> String {
    match result {
        Err(e) => {
            assert!(e.starts_with("MODAL-MECHANISM: ") || e.starts_with("Eigenvalue decomposition failed"), "{what}: refused for another reason: {e}");
            e
        }
        Ok(freqs) => panic!("{what}: a mechanism returned {} modes with no refusal: {freqs:?}", freqs.len()),
    }
}

fn freqs_3d(input: &SolverInput3D, n: usize) -> Result<Vec<f64>, String> {
    solve_modal_3d(input, &densities(), n).map(|r| r.modes.iter().map(|m| m.frequency).collect())
}

fn freqs_2d(input: &SolverInput, n: usize) -> Result<Vec<f64>, String> {
    solve_modal_2d(input, &densities(), n).map(|r| r.modes.iter().map(|m| m.frequency).collect())
}

#[test]
fn the_mystran_differential_mechanism_is_refused_instead_of_dropping_its_zero_mode() {
    let mut model: serde_json::Value = serde_json::from_str(include_str!("fixtures/modal_mechanism/mystran-modal3d_lumped-744196.json")).unwrap();
    let densities: HashMap<String, f64> = serde_json::from_value(model.as_object_mut().unwrap().remove("_densities").unwrap()).unwrap();
    let input: SolverInput3D = serde_json::from_value(model).unwrap();
    let result = solve_modal_3d(&input, &densities, 12).map(|r| r.modes.iter().map(|m| m.frequency).collect());
    let e = refusal(result, "modal3d_lumped-744196");
    assert!(e.starts_with("MODAL-MECHANISM: ") && e.contains("No modes are returned"), "{e}");
}

#[test]
fn a_hinged_arm_with_a_free_tip_is_refused_as_a_mechanism_in_3d() {
    refusal(freqs_3d(&column_with_hinged_arm_3d(1, true), 12), "3D, dense eigensolver");
    refusal(freqs_3d(&column_with_hinged_arm_3d(20, true), 12), "3D, sparse eigensolver");
}

#[test]
fn a_hinged_arm_with_a_free_tip_is_refused_as_a_mechanism_in_2d() {
    refusal(freqs_2d(&column_with_hinged_arm_2d(true), 4), "2D");
}

#[test]
fn the_same_frames_without_the_hinge_return_every_requested_mode() {
    for segments in [1, 20] {
        let f = freqs_3d(&column_with_hinged_arm_3d(segments, false), 6).unwrap();
        assert_eq!(f.len(), 6, "{segments} segments: {f:?}");
        assert!(f.iter().all(|&x| x > 0.1), "{f:?}");
    }
    let f = freqs_2d(&column_with_hinged_arm_2d(false), 4).unwrap();
    assert_eq!(f.len(), 4, "{f:?}");
}


#[test]
fn a_spin_that_moves_no_translational_mass_is_reported_as_a_null_mode() {
    let input: SolverInput3D = serde_json::from_value(json!({
        "nodes": {
            "1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0},
            "2": {"id": 2, "x": 0.13, "y": 0.07, "z": 3.0},
        },
        "materials": {"1": {"id": 1, "e": 200_000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 2e-4, "iz": 1e-4, "j": 5e-5}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1, "releaseTStart": true}},
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
        "loads": [],
        "masses": {"nodal": [{"nodeId": 2, "mass": 0.0, "ixx": 0.1, "iyy": 0.1, "izz": 0.1}]},
    }))
    .unwrap();
    match solve_modal_3d(&input, &densities(), 4) {
        Ok(r) => {
            assert!(!r.null_modes.is_empty(), "the free twist is neither returned nor reported: {:?}", r.modes.iter().map(|m| m.frequency).collect::<Vec<_>>());
            assert!(r.null_modes.iter().all(|m| m.node_id == 2 && m.dof.starts_with('r')), "{:?}", r.null_modes);
            assert!(r.modes.iter().all(|m| m.frequency > 0.1));
        }
        Err(e) => assert!(!e.starts_with("MODAL-MECHANISM"), "a twist with no translational mass refused as a mechanism: {e}"),
    }
}
