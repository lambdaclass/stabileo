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

const MECHANISM: &str = "MODAL-MECHANISM: ";
const SINGULAR: &str = "Eigenvalue decomposition failed";

fn refusal(result: Result<Vec<f64>, String>, what: &str, expected: &[&str]) -> String {
    match result {
        Err(e) => {
            assert!(expected.iter().any(|x| e.starts_with(x)), "{what}: refused for another reason: {e}");
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
    let e = refusal(result, "modal3d_lumped-744196", &[MECHANISM]);
    assert!(e.contains("No modes are returned"), "{e}");
}

#[test]
fn a_hinged_arm_with_a_free_tip_is_refused_as_a_mechanism_in_3d() {
    refusal(freqs_3d(&column_with_hinged_arm_3d(1, true), 12), "3D, dense eigensolver", &[MECHANISM]);
    refusal(freqs_3d(&column_with_hinged_arm_3d(20, true), 12), "3D, sparse eigensolver", &[MECHANISM, SINGULAR]);
}

#[test]
fn a_hinged_arm_with_a_free_tip_is_refused_as_a_mechanism_in_2d() {
    refusal(freqs_2d(&column_with_hinged_arm_2d(true), 4), "2D", &[MECHANISM, SINGULAR]);
}

#[test]
fn a_hinged_arm_numbered_around_its_support_is_refused_naming_its_tip() {
    let input: SolverInput = serde_json::from_value(json!({
        "nodes": {
            "1": {"id": 1, "x": 1.7, "z": 3.6},
            "2": {"id": 2, "x": 0.0, "z": 0.0},
            "3": {"id": 3, "x": 0.0, "z": 3.0},
            "4": {"id": 4, "x": 4.0, "z": 0.0},
            "5": {"id": 5, "x": 4.0, "z": 3.0},
        },
        "materials": {"1": {"id": 1, "e": 200_000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false},
            "2": {"id": 2, "type": "frame", "nodeI": 3, "nodeJ": 1, "materialId": 1, "sectionId": 1, "hingeStart": true, "hingeEnd": false},
            "3": {"id": 3, "type": "frame", "nodeI": 3, "nodeJ": 5, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false},
            "4": {"id": 4, "type": "frame", "nodeI": 4, "nodeJ": 5, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false},
        },
        "supports": {
            "1": {"id": 1, "nodeId": 2, "type": "fixed"},
            "2": {"id": 2, "nodeId": 4, "type": "pinned"},
        },
        "loads": [],
        "masses": {"nodal": [{"nodeId": 1, "mass": 5.0}]},
    }))
    .unwrap();
    let e = refusal(freqs_2d(&input, 4), "2D, support between free node ids", &[MECHANISM]);
    assert!(e.contains("moves node 1 along u"), "{e}");
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


fn spinning_column(spin_spring: Option<f64>) -> SolverInput3D {
    let mut supports = json!({"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}});
    let mut nodes = json!({
        "1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0},
        "2": {"id": 2, "x": 0.13, "y": 0.07, "z": 3.0},
    });
    let mut connectors = json!({});
    if let Some(k) = spin_spring {
        nodes["3"] = json!({"id": 3, "x": 0.13, "y": 0.07, "z": 4.0});
        supports["2"] = json!({"nodeId": 3, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true});
        connectors["1"] = json!({"id": 1, "nodeI": 2, "nodeJ": 3, "kMoment": k});
    }
    serde_json::from_value(json!({
        "nodes": nodes,
        "connectors": connectors,
        "materials": {"1": {"id": 1, "e": 200_000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 2e-4, "iz": 1e-4, "j": 5e-5}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1, "releaseTStart": true}},
        "supports": supports,
        "loads": [],
        "masses": {"nodal": [{"nodeId": 2, "mass": 0.0, "ixx": 0.1, "iyy": 0.1, "izz": 0.1}]},
    }))
    .unwrap()
}

#[test]
fn a_spin_that_moves_no_translational_mass_is_reported_as_a_null_mode() {
    let input = spinning_column(None);
    let r = solve_modal_3d(&input, &densities(), 4).expect("a twist with no translational mass is not a mechanism of the mass");
    assert!(!r.null_modes.is_empty(), "the free twist is neither returned nor reported: {:?}", r.modes.iter().map(|m| m.frequency).collect::<Vec<_>>());
    assert!(r.null_modes.iter().all(|m| m.node_id == 2 && m.dof.starts_with('r')), "{:?}", r.null_modes);
    assert!(!r.modes.is_empty() && r.modes.iter().all(|m| m.frequency > 0.1), "{:?}", r.modes.iter().map(|m| m.frequency).collect::<Vec<_>>());
}

fn spinning_column_numbered_around_its_support(spin_spring: Option<f64>) -> SolverInput3D {
    let mut input = serde_json::to_value(spinning_column(spin_spring)).unwrap();
    let swap = |v: &mut serde_json::Value| if let Some(id) = v.as_u64() { *v = json!(match id { 1 => 2, 2 => 1, x => x }) };
    let nodes = input["nodes"].as_object().unwrap().clone();
    input["nodes"] = json!({});
    for (_, mut node) in nodes {
        swap(&mut node["id"]);
        let id = node["id"].to_string();
        input["nodes"][id] = node;
    }
    for group in ["supports", "connectors"] {
        for (_, item) in input[group].as_object_mut().unwrap() {
            for key in ["nodeId", "nodeI", "nodeJ"] {
                if item.get(key).is_some() { swap(&mut item[key]); }
            }
        }
    }
    for key in ["nodeI", "nodeJ"] { swap(&mut input["elements"]["1"][key]); }
    swap(&mut input["masses"]["nodal"][0]["nodeId"]);
    input["nodes"]["4"] = json!({"id": 4, "x": 2.0, "y": 0.0, "z": 0.0});
    input["nodes"]["5"] = json!({"id": 5, "x": 2.0, "y": 0.0, "z": 2.5});
    input["supports"]["9"] = json!({"nodeId": 4, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true});
    input["elements"]["2"] = json!({"id": 2, "type": "frame", "nodeI": 4, "nodeJ": 5, "materialId": 1, "sectionId": 1});
    input["masses"]["nodal"].as_array_mut().unwrap().push(json!({"nodeId": 5, "mass": 2.0}));
    serde_json::from_value(input).unwrap()
}

#[test]
fn a_free_spin_is_located_on_its_own_node_when_supports_sit_between_free_node_ids() {
    let r = solve_modal_3d(&spinning_column_numbered_around_its_support(None), &densities(), 4).expect("a twist with no translational mass");
    assert!(!r.null_modes.is_empty() && r.null_modes.iter().all(|m| m.node_id == 1 && m.dof.starts_with('r')), "{:?}", r.null_modes);
    let e = refusal(freqs_3d(&spinning_column_numbered_around_its_support(Some(-10.0)), 4), "negative twist, renumbered", &[MECHANISM]);
    assert!(e.contains("(ω² = -") && e.contains("moves node 1 along"), "{e}");
}

#[test]
fn a_free_spin_does_not_take_the_place_of_a_requested_mode() {
    let r = solve_modal_3d(&spinning_column(None), &densities(), 1).expect("one mode of a column free to spin");
    assert!(!r.null_modes.is_empty(), "{:?}", r.null_modes);
    assert_eq!(r.modes.len(), 1, "the free spin took the only requested mode");
    assert!(r.modes[0].frequency > 0.1, "{}", r.modes[0].frequency);
}

fn spinning_columns(free_mass: bool) -> SolverInput3D {
    let column = |id: usize, x: f64| {
        (json!({"id": id, "x": x, "y": 0.0, "z": 0.0}), json!({"id": id + 1, "x": x + 0.13, "y": 0.07, "z": 3.0}))
    };
    let mut nodes = Map::new();
    let mut elements = Map::new();
    let mut supports = Map::new();
    let mut nodal = vec![];
    for (k, x) in [0.0, 5.0].into_iter().enumerate() {
        let (foot, head) = column(2 * k + 1, x);
        nodes.insert((2 * k + 1).to_string(), foot);
        nodes.insert((2 * k + 2).to_string(), head);
        elements.insert((k + 1).to_string(), json!({"id": k + 1, "type": "frame", "nodeI": 2 * k + 1, "nodeJ": 2 * k + 2, "materialId": 1, "sectionId": 1, "releaseTStart": true}));
        supports.insert((k + 1).to_string(), json!({"nodeId": 2 * k + 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}));
        nodal.push(json!({"nodeId": 2 * k + 2, "mass": 0.0, "ixx": 0.1, "iyy": 0.1, "izz": 0.1}));
    }
    if free_mass {
        nodes.insert("5".into(), json!({"id": 5, "x": 10.0, "y": 0.0, "z": 0.0}));
        nodes.insert("6".into(), json!({"id": 6, "x": 10.1, "y": 0.0, "z": 3.0}));
        nodes.insert("7".into(), json!({"id": 7, "x": 11.3, "y": 0.7, "z": 3.4}));
        elements.insert("3".into(), json!({"id": 3, "type": "frame", "nodeI": 5, "nodeJ": 6, "materialId": 1, "sectionId": 1}));
        elements.insert("4".into(), json!({"id": 4, "type": "frame", "nodeI": 6, "nodeJ": 7, "materialId": 1, "sectionId": 1, "releaseMyStart": true}));
        supports.insert("3".into(), json!({"nodeId": 5, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}));
        nodal.push(json!({"nodeId": 6, "mass": 1.0}));
        nodal.push(json!({"nodeId": 7, "mass": 0.5}));
    }
    serde_json::from_value(json!({
        "nodes": nodes,
        "materials": {"1": {"id": 1, "e": 200_000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 2e-4, "iz": 1e-4, "j": 5e-5}},
        "elements": elements,
        "supports": supports,
        "loads": [],
        "masses": {"nodal": nodal},
    }))
    .unwrap()
}

#[test]
fn two_free_spins_do_not_take_the_places_of_requested_modes() {
    let r = solve_modal_3d(&spinning_columns(false), &densities(), 1).expect("one mode of two columns free to spin");
    assert_eq!(r.null_modes.len(), 2, "{:?}", r.null_modes);
    assert_eq!(r.modes.len(), 1);
    assert!(r.modes[0].frequency > 0.1, "{}", r.modes[0].frequency);
}

#[test]
fn a_mechanism_behind_two_free_spins_is_still_refused() {
    let e = refusal(freqs_3d(&spinning_columns(true), 1), "a hinged arm behind two free spins", &[MECHANISM, SINGULAR]);
    assert!(!e.starts_with(MECHANISM) || e.contains("moves node 7 along u"), "{e}");
}

#[test]
fn a_twist_against_a_negative_spring_is_refused_though_it_moves_no_translational_mass() {
    let e = refusal(freqs_3d(&spinning_column(Some(-10.0)), 4), "twist on a negative torsional spring", &[MECHANISM]);
    assert!(e.contains("(ω² = -") && e.contains("moves node 2 along"), "{e}");
}

fn seesaw(arm: f64, far: f64, pivot_inertia: f64) -> SolverInput {
    serde_json::from_value(json!({
        "nodes": {
            "1": {"id": 1, "x": -arm, "z": 0.0},
            "2": {"id": 2, "x": 0.0, "z": 0.0},
            "3": {"id": 3, "x": arm, "z": 0.0},
            "4": {"id": 4, "x": far, "z": 0.0},
            "5": {"id": 5, "x": far, "z": 3.0},
        },
        "materials": {"1": {"id": 1, "e": 200_000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false},
            "3": {"id": 3, "type": "frame", "nodeI": 4, "nodeJ": 5, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false},
        },
        "supports": {"1": {"id": 1, "nodeId": 2, "type": "pinned"}, "2": {"id": 2, "nodeId": 4, "type": "fixed"}},
        "loads": [],
        "masses": {"nodal": [{"nodeId": 2, "mass": 0.0, "iy": pivot_inertia}]},
    }))
    .unwrap()
}

#[test]
fn a_seesaw_whose_ends_move_opposite_ways_is_refused_though_no_rigid_translation_excites_it() {
    for (arm, far, pivot_inertia) in [(2.0, 10.0, 0.0), (0.01, 1e5, 0.0), (2.0, 10.0, 1e9)] {
        let e = refusal(freqs_2d(&seesaw(arm, far, pivot_inertia), 4), &format!("seesaw of arm {arm} m beside a column {far} m away, {pivot_inertia} t·m² at the pivot"), &[MECHANISM]);
        assert!(e.contains("moves node 1 along uz") || e.contains("moves node 3 along uz"), "{e}");
    }
}

fn slender_cantilever(iz: f64) -> SolverInput {
    let (length, segments) = (2000.0, 40);
    let mut nodes = Map::new();
    let mut elements = Map::new();
    for i in 0..=segments {
        nodes.insert((i + 1).to_string(), json!({"id": i + 1, "x": length * i as f64 / segments as f64, "z": 0.0}));
        if i > 0 {
            elements.insert(i.to_string(), json!({"id": i, "type": "frame", "nodeI": i, "nodeJ": i + 1, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false}));
        }
    }
    serde_json::from_value(json!({
        "nodes": nodes,
        "materials": {"1": {"id": 1, "e": 200_000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 1e-4, "iz": iz}},
        "elements": elements,
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
        "loads": [],
    }))
    .unwrap()
}

#[test]
fn a_cantilever_soft_enough_for_omega_squared_below_1e_minus_10_keeps_its_modes() {
    let r = solve_modal_2d(&slender_cantilever(1e-13), &densities(), 4).expect("a soft, stable cantilever is not a mechanism");
    assert!(r.null_modes.is_empty(), "{:?}", r.null_modes);
    assert_eq!(r.modes.len(), 4);
    let w2: Vec<f64> = r.modes.iter().map(|m| m.omega * m.omega).collect();
    assert!(w2[0] < 1e-10, "not soft enough to test the old absolute cut: {w2:?}");
    let ratio = r.modes[1].omega / r.modes[0].omega;
    let exact = (4.694_091_f64 / 1.875_104).powi(2);
    assert!((ratio - exact).abs() < 1e-2 * exact, "second to first bending frequency {ratio}, Euler-Bernoulli {exact}");
}

fn stiff_column_with_soft_arm(stiffness_ratio: f64) -> SolverInput {
    serde_json::from_value(json!({
        "nodes": {
            "1": {"id": 1, "x": 0.0, "z": 0.0},
            "2": {"id": 2, "x": 0.0, "z": 3.0},
            "3": {"id": 3, "x": 2.0, "z": 3.0},
        },
        "materials": {"1": {"id": 1, "e": 200_000.0, "nu": 0.3}, "2": {"id": 2, "e": 200_000.0 * stiffness_ratio, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 2, "sectionId": 1, "hingeStart": false, "hingeEnd": false},
        },
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
        "loads": [],
        "masses": {"nodal": [{"nodeId": 2, "mass": 1.0}, {"nodeId": 3, "mass": 0.5}]},
    }))
    .unwrap()
}

#[test]
fn a_stable_frame_with_an_arm_up_to_1e12_times_softer_keeps_the_arm_modes() {
    for ratio in [1e-8, 1e-10, 1e-12] {
        let freqs = freqs_2d(&stiff_column_with_soft_arm(ratio), 3).unwrap_or_else(|e| panic!("stiffness ratio {ratio:e}: {e}"));
        let ei = 200_000.0 * 1000.0 * ratio * 1e-4;
        let exact = (3.0 * ei / (0.5 * 8.0)).sqrt() / (2.0 * std::f64::consts::PI);
        assert_eq!(freqs.len(), 3, "stiffness ratio {ratio:e}: {freqs:?}");
        assert!((freqs[0] / exact - 1.0).abs() <= 1e-3, "stiffness ratio {ratio:e}: arm mode {} Hz, cantilever 3EI/(mL³) gives {exact} Hz", freqs[0]);
        let axial = (200_000.0 * 1000.0 * ratio * 0.01 / 2.0 / 0.5f64).sqrt() / (2.0 * std::f64::consts::PI);
        assert!((freqs[1] / axial - 1.0).abs() <= 1e-3, "stiffness ratio {ratio:e}: arm axial mode {} Hz, EA/(mL) gives {axial} Hz", freqs[1]);
    }
}

fn meshed_frame(path: &[(f64, f64)], segments: usize, iz: f64, fixed_far_end: bool) -> SolverInput {
    let mut nodes = Map::new();
    let mut elements = Map::new();
    nodes.insert("1".into(), json!({"id": 1, "x": path[0].0, "z": path[0].1}));
    let mut last = 1;
    for w in path.windows(2) {
        for s in 1..=segments {
            let f = s as f64 / segments as f64;
            let id = last + 1;
            nodes.insert(id.to_string(), json!({"id": id, "x": w[0].0 + f * (w[1].0 - w[0].0), "z": w[0].1 + f * (w[1].1 - w[0].1)}));
            elements.insert(last.to_string(), json!({"id": last, "type": "frame", "nodeI": last, "nodeJ": id, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false}));
            last = id;
        }
    }
    let mut supports = json!({"1": {"id": 1, "nodeId": 1, "type": "fixed"}});
    if fixed_far_end {
        supports["2"] = json!({"id": 2, "nodeId": last, "type": "fixed"});
    }
    serde_json::from_value(json!({
        "nodes": nodes,
        "materials": {"1": {"id": 1, "e": 200_000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": iz}},
        "elements": elements,
        "supports": supports,
        "loads": [],
    }))
    .unwrap()
}

#[test]
fn a_thousand_elements_per_member_still_return_the_lowest_modes() {
    let cantilever = [(0.0, 0.0), (10.0, 0.0)];
    let portal = [(0.0, 0.0), (0.0, 3.0), (20.0, 3.0), (20.0, 0.0)];
    for (name, path, iz, far) in [("cantilever", &cantilever[..], 1e-4, false), ("portal", &portal[..], 1e-4, true)] {
        let coarse = freqs_2d(&meshed_frame(path, 100, iz, far), 2).unwrap_or_else(|e| panic!("{name}, 100 per member: {e}"));
        let fine = freqs_2d(&meshed_frame(path, 1000, iz, far), 2).unwrap_or_else(|e| panic!("{name}, 1000 per member: {e}"));
        assert_eq!((coarse.len(), fine.len()), (2, 2), "{name}: {coarse:?} with 100 elements per member, {fine:?} with 1000");
        for (c, f) in coarse.iter().zip(&fine) {
            assert!((f / c - 1.0).abs() < 1e-4, "{name}: {f} Hz with 1000 elements per member, {c} Hz with 100");
        }
    }
}

fn seesaw_on_rollers(support: &str, angle: Option<f64>) -> SolverInput {
    let mut input = serde_json::to_value(seesaw(2.0, 10.0, 0.0)).unwrap();
    for (id, node) in [("3", 1), ("4", 3)] {
        input["supports"][id] = json!({"id": id.parse::<usize>().unwrap(), "nodeId": node, "type": support, "angle": angle});
    }
    input["masses"]["nodal"] = json!([{"nodeId": 1, "mass": 1.0}, {"nodeId": 3, "mass": 1.0}]);
    serde_json::from_value(input).unwrap()
}

#[test]
fn a_seesaw_whose_ends_slide_on_inclined_rollers_is_refused() {
    let e = refusal(freqs_2d(&seesaw_on_rollers("rollerZ", None), 4), "seesaw on vertical rollers", &[MECHANISM]);
    assert!(e.contains("moves node 1") || e.contains("moves node 3"), "{e}");
    for angle in [std::f64::consts::FRAC_PI_2, -std::f64::consts::FRAC_PI_2] {
        let e = refusal(freqs_2d(&seesaw_on_rollers("inclinedRoller", Some(angle)), 4), &format!("seesaw on rollers inclined {angle} rad"), &[MECHANISM]);
        assert!(e.contains("moves node 1") || e.contains("moves node 3"), "{e}");
    }
}

#[test]
fn a_seesaw_held_by_rollers_inclined_off_the_vertical_keeps_its_modes() {
    let f = freqs_2d(&seesaw_on_rollers("inclinedRoller", Some(1.2)), 4).unwrap();
    assert_eq!(f.len(), 4, "{f:?}");
    assert!(f.iter().all(|&x| x > 0.1), "{f:?}");
}

fn turntable_3d(inclined: bool) -> SolverInput3D {
    let end = |node: usize| if inclined {
        json!({"nodeId": node, "rx": false, "ry": false, "rz": false, "rrx": false, "rry": false, "rrz": false, "isInclined": true, "normalX": 0.0, "normalY": 0.0, "normalZ": 1.0})
    } else {
        json!({"nodeId": node, "rx": false, "ry": false, "rz": true, "rrx": false, "rry": false, "rrz": false})
    };
    serde_json::from_value(json!({
        "nodes": {
            "1": {"id": 1, "x": -2.0, "y": 0.0, "z": 0.0},
            "2": {"id": 2, "x": 0.0, "y": 0.0, "z": 0.0},
            "3": {"id": 3, "x": 2.0, "y": 0.0, "z": 0.0},
            "4": {"id": 4, "x": 10.0, "y": 0.0, "z": 0.0},
            "5": {"id": 5, "x": 10.0, "y": 0.0, "z": 3.0},
        },
        "materials": {"1": {"id": 1, "e": 200_000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 2e-4, "iz": 1e-4, "j": 5e-5}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1},
            "3": {"id": 3, "type": "frame", "nodeI": 4, "nodeJ": 5, "materialId": 1, "sectionId": 1},
        },
        "supports": {
            "1": {"nodeId": 2, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": false, "rrz": false},
            "2": end(1),
            "3": end(3),
            "4": {"nodeId": 4, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true},
        },
        "loads": [],
        "masses": {"nodal": [{"nodeId": 1, "mass": 1.0}, {"nodeId": 3, "mass": 1.0}]},
    }))
    .unwrap()
}

#[test]
fn a_turntable_whose_ends_slide_on_inclined_supports_is_refused_in_3d() {
    for inclined in [false, true] {
        let e = refusal(freqs_3d(&turntable_3d(inclined), 6), &format!("turntable, inclined ends: {inclined}"), &[MECHANISM]);
        assert!(e.contains("moves node 1") || e.contains("moves node 3"), "{e}");
    }
}
