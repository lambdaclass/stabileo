use dedaliano_engine::certify::buckling::{
    certify_buckling_2d, certify_buckling_3d, BucklingCertificate,
};
use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};
use dedaliano_engine::metamorphic::transform::{transform_2d, Iso2};
use dedaliano_engine::metamorphic::units::{
    scale_2d, scale_3d, scale_load_2d, scale_load_3d, Units,
};
use dedaliano_engine::solver::buckling::{buckling_system_2d, buckling_system_3d, solve_buckling_2d, solve_buckling_3d};
use dedaliano_engine::solver::{corotational, pdelta};
use dedaliano_engine::types::*;

fn issue_982() -> SolverInput {
    serde_json::from_str(include_str!("../metamorphic_corpus/nightly/issue-982.json")).unwrap()
}

fn issue_1465() -> SolverInput3D {
    serde_json::from_str(include_str!("../fixtures/buckling-1465.json")).unwrap()
}

fn rotated_issue_982() -> SolverInput {
    transform_2d(&issue_982(), &Iso2::rotation(1f64.to_radians())).unwrap()
}

fn scaled_loads_2d(mut input: SolverInput, scale: f64) -> SolverInput {
    let units = Units {
        length: 1.0,
        force: scale,
        time: 1.0,
    };
    for load in &mut input.loads {
        scale_load_2d(load, &units);
    }
    input
}

fn scaled_loads_3d(mut input: SolverInput3D, scale: f64) -> SolverInput3D {
    let units = Units {
        length: 1.0,
        force: scale,
        time: 1.0,
    };
    for load in &mut input.loads {
        scale_load_3d(load, &units);
    }
    input
}

fn assert_same_factors(actual: &[f64], expected: &[f64]) {
    assert_eq!(
        actual.len(),
        expected.len(),
        "actual {actual:?}, expected {expected:?}"
    );
    for (a, e) in actual.iter().zip(expected) {
        assert!(
            (a / e - 1.0).abs() <= 1e-8,
            "actual {actual:?}, expected {expected:?}"
        );
    }
}

#[test]
fn round_off_member_kg_adds_no_mode_to_the_two_euler_modes_2d() {
    let reference = solve_buckling_2d(&issue_982(), 3).unwrap();
    let reference: Vec<f64> = reference.modes.iter().map(|m| m.load_factor).collect();
    let rotated = solve_buckling_2d(&rotated_issue_982(), 3).unwrap();
    let actual: Vec<f64> = rotated.modes.iter().map(|m| m.load_factor).collect();
    assert_eq!(
        reference.len(),
        2,
        "P_cr = π²EI/(KL)² gives the two member modes: {reference:?}"
    );
    assert_same_factors(&actual, &reference);
}

#[test]
fn round_off_member_kg_adds_no_mode_to_the_two_euler_modes_3d() {
    let reference = solve_buckling_3d(&embed_2d(&issue_982(), Plane::XZ).unwrap(), 3).unwrap();
    let reference: Vec<f64> = reference.modes.iter().map(|m| m.load_factor).collect();
    let rotated = embed_2d(&rotated_issue_982(), Plane::XZ).unwrap();
    let rotated = solve_buckling_3d(&rotated, 3).unwrap();
    let actual: Vec<f64> = rotated.modes.iter().map(|m| m.load_factor).collect();
    assert_eq!(
        reference.len(),
        2,
        "P_cr = π²EI/(KL)² gives the two member modes: {reference:?}"
    );
    assert_same_factors(&actual, &reference);
}

#[test]
fn round_off_member_kg_is_invariant_under_units_and_load_scaling_2d() {
    let input = rotated_issue_982();
    let base = solve_buckling_2d(&input, 3).unwrap();
    let expected: Vec<f64> = base.modes.iter().map(|m| m.load_factor).collect();
    let mm_n = scale_2d(&input, &Units::froude(1e3, 1e3));
    let actual = solve_buckling_2d(&mm_n, 3).unwrap();
    let actual: Vec<f64> = actual.modes.iter().map(|m| m.load_factor).collect();
    assert_same_factors(&actual, &expected);
    let scaled = solve_buckling_2d(&scaled_loads_2d(input, 1e3), 3).unwrap();
    let actual: Vec<f64> = scaled.modes.iter().map(|m| m.load_factor * 1e3).collect();
    assert_same_factors(&actual, &expected);
}

#[test]
fn round_off_member_kg_is_invariant_under_units_and_load_scaling_3d() {
    let input = embed_2d(&rotated_issue_982(), Plane::XZ).unwrap();
    let base = solve_buckling_3d(&input, 3).unwrap();
    let expected: Vec<f64> = base.modes.iter().map(|m| m.load_factor).collect();
    let mm_n = scale_3d(&input, &Units::froude(1e3, 1e3));
    let actual = solve_buckling_3d(&mm_n, 3).unwrap();
    let actual: Vec<f64> = actual.modes.iter().map(|m| m.load_factor).collect();
    assert_same_factors(&actual, &expected);
    let scaled = solve_buckling_3d(&scaled_loads_3d(input, 1e3), 3).unwrap();
    let actual: Vec<f64> = scaled.modes.iter().map(|m| m.load_factor * 1e3).collect();
    assert_same_factors(&actual, &expected);
}

#[test]
fn resolved_cantilever_compression_remains_a_euler_buckling_control() {
    let input: SolverInput = serde_json::from_value(serde_json::json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "z": 4.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": -10.0, "my": 0.0}}]
    })).unwrap();
    let ei = 200000.0 * 1000.0 * 1e-4;
    let euler = std::f64::consts::PI.powi(2) * ei / (2.0 * 4.0f64).powi(2);
    let one_element = (5.2 - 19.84f64.sqrt()) / 0.3 * ei / 4.0f64.powi(2);
    assert!(
        (one_element / euler - 1.0).abs() < 0.01,
        "one-element P_cr {one_element}, Euler π²EI/(2L)² {euler}"
    );
    let result = solve_buckling_2d(&input, 1).unwrap();
    assert!(
        (result.modes[0].load_factor * 10.0 / one_element - 1.0).abs() < 1e-10,
        "λP = {}, exact one-element root = {one_element}",
        result.modes[0].load_factor * 10.0
    );
    let input = embed_2d(&input, Plane::XZ).unwrap();
    let result = solve_buckling_3d(&input, 1).unwrap();
    assert!(
        (result.modes[0].load_factor * 10.0 / one_element - 1.0).abs() < 1e-10,
        "λP = {}, exact one-element root = {one_element}",
        result.modes[0].load_factor * 10.0
    );
}

#[test]
fn issue_1465_cantilever_keeps_its_one_element_euler_factor() {
    let input = issue_1465();
    let (a, b) = (&input.nodes["1"], &input.nodes["2"]);
    let d = [b.x - a.x, b.y - a.y, b.z - a.z];
    let l = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
    let SolverLoad3D::Nodal(tip) = &input.loads[1] else { panic!("tip load") };
    let n = (tip.fx * d[0] + tip.fy * d[1] + tip.fz * d[2]) / l;
    let ei = input.materials["1"].e * 1000.0 * input.sections["1"].iy;
    let euler = std::f64::consts::PI.powi(2) * ei / (2.0 * l).powi(2) / -n;
    let one_element = (5.2 - 19.84f64.sqrt()) / 0.3 * ei / l.powi(2) / -n;
    let lambda = solve_buckling_3d(&input, 1).unwrap().modes[0].load_factor;
    assert!((lambda / one_element - 1.0).abs() < 1e-4, "λ = {lambda}, one-element root {one_element}");
    assert!((lambda / euler - 1.0).abs() < 1e-2, "λ = {lambda}, Euler π²EI/(2L)²/N = {euler}");
}

#[test]
fn a_slender_tie_in_tension_leaves_the_cantilever_column_factor_unchanged() {
    let model = |with_tie: bool| -> SolverInput {
        let mut v = serde_json::json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "z": 4.0}},
            "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
            "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}, "2": {"id": 2, "a": 7.85e-5, "iz": 4.9e-10}},
            "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
            "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
            "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": -10.0, "my": 0.0}}]
        });
        if with_tie {
            v["nodes"]["3"] = serde_json::json!({"id": 3, "x": 10.0, "z": 0.0});
            v["nodes"]["4"] = serde_json::json!({"id": 4, "x": 20.0, "z": 0.0});
            v["elements"]["2"] = serde_json::json!({"id": 2, "type": "frame", "nodeI": 3, "nodeJ": 4, "materialId": 1, "sectionId": 2});
            v["supports"]["3"] = serde_json::json!({"id": 3, "nodeId": 3, "type": "pinned"});
            v["supports"]["4"] = serde_json::json!({"id": 4, "nodeId": 4, "type": "rollerX"});
            v["loads"].as_array_mut().unwrap().push(serde_json::json!({"type": "nodal", "data": {"nodeId": 4, "fx": 5000.0, "fz": 0.0, "my": 0.0}}));
        }
        serde_json::from_value(v).unwrap()
    };
    let ei = 200000.0 * 1000.0 * 1e-4;
    let one_element = (5.2 - 19.84f64.sqrt()) / 0.3 * ei / 4.0f64.powi(2) / 10.0;
    for with_tie in [false, true] {
        let input = model(with_tie);
        let plane = solve_buckling_2d(&input, 1).unwrap().modes[0].load_factor;
        let space = solve_buckling_3d(&embed_2d(&input, Plane::XZ).unwrap(), 1).unwrap().modes[0].load_factor;
        for lambda in [plane, space] {
            assert!((lambda / one_element - 1.0).abs() < 1e-10, "tie {with_tie}: λ = {lambda}, one-element root {one_element}");
        }
    }
}

#[test]
fn a_large_force_in_a_separate_member_leaves_a_small_resolved_compression_in_kg() {
    let model = |with_tie: bool| -> SolverInput {
        let mut v = serde_json::json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "z": 10.0}},
            "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
            "sections": {"1": {"id": 1, "a": 1e-4, "iz": 1e-12}, "2": {"id": 2, "a": 0.01, "iz": 1e-4}},
            "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
            "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
            "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": -1e-9, "my": 0.0}}]
        });
        if with_tie {
            v["nodes"]["3"] = serde_json::json!({"id": 3, "x": 10.0, "z": 0.0});
            v["nodes"]["4"] = serde_json::json!({"id": 4, "x": 14.0, "z": 0.0});
            v["elements"]["2"] = serde_json::json!({"id": 2, "type": "frame", "nodeI": 3, "nodeJ": 4, "materialId": 1, "sectionId": 2});
            v["supports"]["3"] = serde_json::json!({"id": 3, "nodeId": 3, "type": "pinned"});
            v["supports"]["4"] = serde_json::json!({"id": 4, "nodeId": 4, "type": "rollerX"});
            v["loads"].as_array_mut().unwrap().push(serde_json::json!({"type": "nodal", "data": {"nodeId": 4, "fx": 1e6, "fz": 0.0, "my": 0.0}}));
        }
        serde_json::from_value(v).unwrap()
    };
    let ei = 200000.0 * 1000.0 * 1e-12;
    let one_element = (5.2 - 19.84f64.sqrt()) / 0.3 * ei / 10.0f64.powi(2) / 1e-9;
    for with_tie in [false, true] {
        let input = model(with_tie);
        let plane = solve_buckling_2d(&input, 1).unwrap_or_else(|e| panic!("tie {with_tie}: {e}")).modes[0].load_factor;
        let space = solve_buckling_3d(&embed_2d(&input, Plane::XZ).unwrap(), 1).unwrap_or_else(|e| panic!("tie {with_tie}: {e}")).modes[0].load_factor;
        for lambda in [plane, space] {
            assert!((lambda / one_element - 1.0).abs() < 1e-6, "tie {with_tie}: λ = {lambda}, one-element root {one_element}");
        }
    }
}

#[test]
fn a_slender_member_whose_compression_is_within_round_off_cannot_be_left_out_of_the_critical_factor() {
    let input: SolverInput = serde_json::from_value(serde_json::json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "z": 4.0}, "3": {"id": 3, "x": 10.0, "z": 0.0}, "4": {"id": 4, "x": 10.0, "z": 10.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}, "2": {"id": 2, "a": 1e-4, "iz": 1e-12}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 3, "nodeJ": 4, "materialId": 1, "sectionId": 2}
        },
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}, "3": {"id": 3, "nodeId": 3, "type": "fixed", "dz": 1e9}},
        "loads": [
            {"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": -10.0, "my": 0.0}},
            {"type": "nodal", "data": {"nodeId": 4, "fx": 0.0, "fz": -1e-3, "my": 0.0}}
        ]
    })).unwrap();
    let root = (5.2 - 19.84f64.sqrt()) / 0.3;
    let column = root * 200000.0 * 1000.0 * 1e-4 / 16.0 / 10.0;
    let slender = root * 200000.0 * 1000.0 * 1e-12 / 100.0 / 1e-3;
    assert!(slender < 1e-4 * column, "the slender member governs: {slender} vs {column}");
    let plane = solve_buckling_2d(&input, 1).map(|b| b.modes[0].load_factor);
    let space = solve_buckling_3d(&embed_2d(&input, Plane::XZ).unwrap(), 1).map(|b| b.modes[0].load_factor);
    for result in [plane, space] {
        let e = result.expect_err("a factor that leaves out a member which could govern");
        assert!(e.contains("Buckling not determinable") && e.contains("elements 2"), "{e}");
    }
}

#[test]
fn a_compression_below_the_old_absolute_floor_on_an_ordinary_column_keeps_its_factor() {
    let input: SolverInput = serde_json::from_value(serde_json::json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "z": 4.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": -1e-7, "my": 0.0}}]
    })).unwrap();
    let one_element = (5.2 - 19.84f64.sqrt()) / 0.3 * 200000.0 * 1000.0 * 1e-4 / 16.0 / 1e-7;
    let plane = solve_buckling_2d(&input, 1).unwrap().modes[0].load_factor;
    let space = solve_buckling_3d(&embed_2d(&input, Plane::XZ).unwrap(), 1).unwrap().modes[0].load_factor;
    for lambda in [plane, space] {
        assert!((lambda / one_element - 1.0).abs() < 1e-8, "λ = {lambda}, one-element root {one_element}");
    }
}

#[test]
fn axial_forces_that_are_round_off_of_bending_or_thermal_strain_are_not_resolved_compression() {
    for (name, json) in [
        ("thermal roller chain", include_str!("../fixtures/buckling-thermal-roller-chain.json")),
        ("thermal cantilever under an end moment", include_str!("../fixtures/buckling-thermal-cantilever-moment.json")),
        ("inclined cantilever under an end moment", include_str!("../fixtures/buckling-inclined-cantilever-moment.json")),
    ] {
        let input: SolverInput = serde_json::from_str(json).unwrap();
        let plane = solve_buckling_2d(&input, 1).map(|b| b.modes[0].load_factor);
        let space = solve_buckling_3d(&embed_2d(&input, Plane::XZ).unwrap(), 1).map(|b| b.modes[0].load_factor);
        for result in [plane, space] {
            let e = result.expect_err(name);
            assert!((e.contains("Buckling not determinable") && e.contains("within round-off")) || e == dedaliano_engine::refusal::no_compressed_elements(), "{name}: {e}");
        }
    }
}

#[test]
fn a_member_left_out_of_kg_by_its_coupled_bound_gets_no_critical_load_and_no_warning() {
    let input: SolverInput = serde_json::from_value(serde_json::json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "z": 4.0}, "3": {"id": 3, "x": 3.0, "z": 4.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}, "2": {"id": 2, "a": 0.1, "iz": 1e-2}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 2}
        },
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed", "dz": 1e3}},
        "loads": [
            {"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": -10.0, "my": 0.0}},
            {"type": "nodal", "data": {"nodeId": 3, "fx": -1e-6, "fz": 0.0, "my": 0.0}}
        ]
    })).unwrap();
    let column = (5.2 - 19.84f64.sqrt()) / 0.3 * 200000.0 * 1000.0 * 1e-4 / 16.0 / 10.0;
    let plane = solve_buckling_2d(&input, 1).unwrap_or_else(|e| panic!("plane: {e}"));
    let space = solve_buckling_3d(&embed_2d(&input, Plane::XZ).unwrap(), 1).unwrap_or_else(|e| panic!("space: {e}"));
    let warned = |d: &[dedaliano_engine::types::StructuredDiagnostic]| d.iter().any(|d| d.phase.as_deref() == Some("BU-UNRESOLVED-MODE"));
    for (name, lambda, ids, warning) in [
        ("plane", plane.modes[0].load_factor, plane.element_data.iter().map(|d| d.element_id).collect::<Vec<_>>(), warned(&plane.structured_diagnostics)),
        ("space", space.modes[0].load_factor, space.element_data.iter().map(|d| d.element_id).collect::<Vec<_>>(), warned(&space.structured_diagnostics)),
    ] {
        assert!((lambda / column - 1.0).abs() < 1e-6, "{name}: λ = {lambda}, column root {column}");
        assert_eq!(ids, vec![1], "{name}: critical loads reported for {ids:?}");
        assert!(!warning, "{name}: BU-UNRESOLVED-MODE");
    }
}

fn separate_column_and_tie_2d(p: f64, dz_base: Option<f64>, constraints: Vec<serde_json::Value>) -> SolverInput {
    let mut base_support = serde_json::json!({"id": 1, "nodeId": 1, "type": "fixed"});
    if let Some(dz) = dz_base {
        base_support["dz"] = serde_json::json!(dz);
    }
    serde_json::from_value(serde_json::json!({
        "nodes": {
            "1": {"id": 1, "x": 0.0, "z": 0.0},
            "2": {"id": 2, "x": 0.0, "z": 10.0},
            "3": {"id": 3, "x": 10.0, "z": 0.0},
            "4": {"id": 4, "x": 14.0, "z": 0.0}
        },
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {
            "1": {"id": 1, "a": 1e-4, "iz": 1e-12},
            "2": {"id": 2, "a": 0.01, "iz": 1e-4}
        },
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 3, "nodeJ": 4, "materialId": 1, "sectionId": 2}
        },
        "supports": {
            "1": base_support,
            "3": {"id": 3, "nodeId": 3, "type": "pinned"},
            "4": {"id": 4, "nodeId": 4, "type": "rollerX"}
        },
        "loads": [
            {"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": -p, "my": 0.0}},
            {"type": "nodal", "data": {"nodeId": 4, "fx": 1e6, "fz": 0.0, "my": 0.0}}
        ],
        "constraints": constraints
    }))
    .unwrap()
}

fn separate_column_and_tie_3d(p: f64, dz_base: Option<f64>, constraints: Vec<serde_json::Value>) -> SolverInput3D {
    let unconstrained = separate_column_and_tie_2d(p, dz_base, vec![]);
    let mut space = embed_2d(&unconstrained, Plane::XZ).unwrap();
    if let Some(dz) = dz_base {
        space.supports.get_mut("1").unwrap().dz = Some(dz);
    }
    space.constraints = serde_json::from_value(serde_json::Value::Array(constraints)).unwrap();
    space
}

fn one_element_cantilever_factor(ei: f64, l: f64, p: f64) -> f64 {
    (5.2 - 19.84f64.sqrt()) / 0.3 * ei / l.powi(2) / p
}

#[test]
fn issue_1756_local_mpc_in_separate_member_leaves_resolved_compression_in_kg() {
    let expected = one_element_cantilever_factor(200000.0 * 1000.0 * 1e-12, 10.0, 1e-9);
    let mpc_2d = serde_json::json!({
        "type": "linearMPC",
        "terms": [
            {"nodeId": 3, "dof": 1, "coefficient": 1.0},
            {"nodeId": 4, "dof": 1, "coefficient": -1.0}
        ]
    });
    let mpc_3d = serde_json::json!({
        "type": "linearMPC",
        "terms": [
            {"nodeId": 3, "dof": 2, "coefficient": 1.0},
            {"nodeId": 4, "dof": 2, "coefficient": -1.0}
        ]
    });

    let plane_input = separate_column_and_tie_2d(1e-9, None, vec![mpc_2d.clone()]);
    let plane = solve_buckling_2d(&plane_input, 1).unwrap();
    let plane_cert = certify_buckling_2d(&plane_input, 1).unwrap();

    let space_input = separate_column_and_tie_3d(1e-9, None, vec![mpc_3d.clone()]);
    let space = solve_buckling_3d(&space_input, 1).unwrap();
    let space_cert = certify_buckling_3d(&space_input, 1).unwrap();

    let mut well_cond_2d = separate_column_and_tie_2d(1e-8, None, vec![mpc_2d.clone()]);
    well_cond_2d.elements.get_mut("1").unwrap().section_id = 2;
    let well_cond_3d = {
        let mut s = separate_column_and_tie_3d(1e-8, None, vec![mpc_3d]);
        s.elements.get_mut("1").unwrap().section_id = 2;
        s
    };
    let expected_well_cond = one_element_cantilever_factor(200000.0 * 1000.0 * 1e-4, 10.0, 1e-8);
    for (name, cert) in [
        ("2d certified enclosure", certify_buckling_2d(&well_cond_2d, 1).unwrap().certificate),
        ("3d certified enclosure", certify_buckling_3d(&well_cond_3d, 1).unwrap().certificate),
    ] {
        match cert {
            BucklingCertificate::Certified { lambda_lower: lower, lambda_upper: Some(upper), .. } => {
                assert!(
                    lower <= expected_well_cond && expected_well_cond <= upper,
                    "{name}: [{lower}, {upper}] does not enclose {expected_well_cond}"
                );
            }
            other => panic!("{name}: expected Certified, got {other:?}"),
        }
    }

    let mut sparse_plane_v = serde_json::to_value(separate_column_and_tie_2d(1e-9, None, vec![mpc_2d])).unwrap();
    for k in 0..24usize {
        let prev = if k == 0 { 4 } else { 10 + k - 1 };
        let next = 10 + k;
        sparse_plane_v["nodes"][next.to_string()] = serde_json::json!({"id": next, "x": 14.0 + (k + 1) as f64, "z": 0.0});
        sparse_plane_v["elements"][next.to_string()] = serde_json::json!({
            "id": next, "type": "frame", "nodeI": prev, "nodeJ": next, "materialId": 1, "sectionId": 2
        });
    }
    sparse_plane_v["constraints"] = serde_json::json!([{
        "type": "linearMPC", "terms": [
            {"nodeId": 10, "dof": 2, "coefficient": 1.0},
            {"nodeId": 11, "dof": 2, "coefficient": -1.0}
        ]
    }]);
    let sparse_plane_input: SolverInput = serde_json::from_value(sparse_plane_v).unwrap();
    let system = buckling_system_2d(&sparse_plane_input).unwrap();
    assert!(system.cs.as_ref().unwrap().n_free_indep < system.dof_num.n_free);
    let sparse_plane = solve_buckling_2d(&sparse_plane_input, 1).unwrap();
    assert!(
        sparse_plane.structured_diagnostics.iter().any(|d| d.code == DiagnosticCode::SparseCholesky),
        "{:?}",
        sparse_plane.structured_diagnostics
    );

    for (name, lambda) in [
        ("2d plain", plane.modes[0].load_factor),
        ("2d certified", plane_cert.results.modes[0].load_factor),
        ("2d sparse constrained", sparse_plane.modes[0].load_factor),
        ("3d plain", space.modes[0].load_factor),
        ("3d certified", space_cert.results.modes[0].load_factor),
    ] {
        assert!(
            (lambda / expected - 1.0).abs() < 1e-6,
            "{name}: λ = {lambda}, expected {expected}"
        );
    }
    let mut plane_control = plane_input.clone();
    plane_control.constraints.clear();
    let mut space_control = space_input.clone();
    space_control.constraints.clear();
    let plane_control = certify_buckling_2d(&plane_control, 1).unwrap();
    let space_control = certify_buckling_3d(&space_control, 1).unwrap();
    for (name, certificate, control_certificate, actual, control) in [
        ("2d", &plane_cert.certificate, &plane_control.certificate, plane_cert.results.modes[0].load_factor, plane_control.results.modes[0].load_factor),
        ("3d", &space_cert.certificate, &space_control.certificate, space_cert.results.modes[0].load_factor, space_control.results.modes[0].load_factor),
    ] {
        assert_eq!(
            std::mem::discriminant(certificate),
            std::mem::discriminant(control_certificate),
            "{name}: constrained {certificate:?}, unconstrained {control_certificate:?}"
        );
        assert!((control / expected - 1.0).abs() < 1e-6, "{name} control: λ = {control}, expected {expected}");
        assert!((actual / control - 1.0).abs() < 1e-6, "{name}: constrained λ = {actual}, unconstrained λ = {control}");
    }
}

#[test]
fn issue_1756_every_constraint_kind_on_free_dofs_of_separate_structure_leaves_column_resolved() {
    let expected = one_element_cantilever_factor(200000.0 * 1000.0 * 1e-12, 10.0, 1e-9);
    let base_2d = |constraint: serde_json::Value| -> SolverInput {
        serde_json::from_value(serde_json::json!({
            "nodes": {
                "1": {"id": 1, "x": 0.0, "z": 0.0},
                "2": {"id": 2, "x": 0.0, "z": 10.0},
                "3": {"id": 3, "x": 10.0, "z": 0.0},
                "4": {"id": 4, "x": 14.0, "z": 0.0},
                "5": {"id": 5, "x": 18.0, "z": 0.0}
            },
            "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
            "sections": {
                "1": {"id": 1, "a": 1e-4, "iz": 1e-12},
                "2": {"id": 2, "a": 0.01, "iz": 1e-4}
            },
            "elements": {
                "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
                "2": {"id": 2, "type": "frame", "nodeI": 3, "nodeJ": 4, "materialId": 1, "sectionId": 2},
                "3": {"id": 3, "type": "frame", "nodeI": 4, "nodeJ": 5, "materialId": 1, "sectionId": 2}
            },
            "supports": {
                "1": {"id": 1, "nodeId": 1, "type": "fixed"},
                "3": {"id": 3, "nodeId": 3, "type": "fixed"}
            },
            "loads": [
                {"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": -1e-9, "my": 0.0}},
                {"type": "nodal", "data": {"nodeId": 4, "fx": 1e6, "fz": 0.0, "my": 0.0}}
            ],
            "constraints": [constraint]
        }))
        .unwrap()
    };

    for (kind, c2) in [
        ("equalDOF", serde_json::json!({"type": "equalDOF", "masterNode": 4, "slaveNode": 5, "dofs": [0, 1]})),
        ("rigidLink", serde_json::json!({"type": "rigidLink", "masterNode": 4, "slaveNode": 5, "dofs": [0, 1, 2]})),
        ("linearMPC", serde_json::json!({"type": "linearMPC", "terms": [{"nodeId": 4, "dof": 0, "coefficient": 1.0}, {"nodeId": 5, "dof": 0, "coefficient": -1.0}]})),
        ("eccentricConnection", serde_json::json!({"type": "eccentricConnection", "masterNode": 4, "slaveNode": 5, "offsetX": 4.0, "offsetY": 0.0, "releases": [false, false, true]})),
        ("diaphragm", serde_json::json!({"type": "diaphragm", "masterNode": 4, "slaveNodes": [5], "plane": "XZ"})),
    ] {
        let input = base_2d(c2);
        let plain = solve_buckling_2d(&input, 1).unwrap_or_else(|e| panic!("2d {kind}: {e}")).modes[0].load_factor;
        let cert = certify_buckling_2d(&input, 1).unwrap_or_else(|e| panic!("2d cert {kind}: {e}")).results.modes[0].load_factor;
        for lambda in [plain, cert] {
            assert!((lambda / expected - 1.0).abs() < 1e-6, "2d {kind}: λ = {lambda}, expected {expected}");
        }
    }

    let base_3d = |constraint: serde_json::Value, warping: bool| -> SolverInput3D {
        let mut u = base_2d(serde_json::json!({"type": "equalDOF", "masterNode": 4, "slaveNode": 5, "dofs": [0]}));
        u.constraints.clear();
        let mut space = embed_2d(&u, Plane::XZ).unwrap();
        if warping {
            for sup in space.supports.values_mut() {
                if matches!(sup.node_id, 1 | 3) {
                    sup.rw = Some(true);
                }
            }
            for sec in space.sections.values_mut() {
                sec.cw = Some(1e-20);
            }
        }
        space.constraints = serde_json::from_value(serde_json::Value::Array(vec![constraint])).unwrap();
        space
    };

    for (kind, c3, warping) in [
        ("equalDOF", serde_json::json!({"type": "equalDOF", "masterNode": 4, "slaveNode": 5, "dofs": [0, 2]}), false),
        ("rigidLink", serde_json::json!({"type": "rigidLink", "masterNode": 4, "slaveNode": 5, "dofs": [0, 2, 4]}), false),
        ("linearMPC", serde_json::json!({"type": "linearMPC", "terms": [{"nodeId": 4, "dof": 0, "coefficient": 1.0}, {"nodeId": 5, "dof": 0, "coefficient": -1.0}]}), false),
        ("eccentricConnection", serde_json::json!({"type": "eccentricConnection", "masterNode": 4, "slaveNode": 5, "offsetX": 4.0, "offsetY": 0.0, "offsetZ": 0.0, "releases": [false, true, false, true, true, true]}), false),
        ("diaphragm", serde_json::json!({"type": "diaphragm", "masterNode": 4, "slaveNodes": [5], "plane": "XZ"}), false),
        ("warping+equalDOF", serde_json::json!({"type": "equalDOF", "masterNode": 4, "slaveNode": 5, "dofs": [0, 2]}), true),
    ] {
        let input = base_3d(c3, warping);
        let plain = solve_buckling_3d(&input, 1).unwrap_or_else(|e| panic!("3d {kind}: {e}")).modes[0].load_factor;
        for lambda in [plain] {
            assert!((lambda / expected - 1.0).abs() < 1e-6, "3d {kind}: λ = {lambda}, expected {expected}");
        }
        let cert = certify_buckling_3d(&input, 1).unwrap_or_else(|e| panic!("3d cert {kind}: {e}")).results.modes[0].load_factor;
        assert!((cert / expected - 1.0).abs() < 1e-6, "3d cert {kind}: λ = {cert}, expected {expected}");
    }
}

#[test]
fn issue_1756_boundary_around_component_own_round_off_bound_with_separate_constraint() {
    let mpc_2d = serde_json::json!({
        "type": "linearMPC",
        "terms": [
            {"nodeId": 3, "dof": 2, "coefficient": 1.0},
            {"nodeId": 4, "dof": 2, "coefficient": -1.0}
        ]
    });
    let mpc_3d = serde_json::json!({
        "type": "linearMPC",
        "terms": [
            {"nodeId": 3, "dof": 4, "coefficient": 1.0},
            {"nodeId": 4, "dof": 4, "coefficient": -1.0}
        ]
    });

    let below_2d = separate_column_and_tie_2d(2000.0 * 2.0f64.powi(-45), Some(1.0), vec![mpc_2d.clone()]);
    let below_3d = separate_column_and_tie_3d(2000.0 * 2.0f64.powi(-45), Some(1.0), vec![mpc_3d.clone()]);
    for err in [
        solve_buckling_2d(&below_2d, 1).unwrap_err(),
        certify_buckling_2d(&below_2d, 1).unwrap_err(),
        solve_buckling_3d(&below_3d, 1).unwrap_err(),
        certify_buckling_3d(&below_3d, 1).unwrap_err(),
    ] {
        assert!(err.contains("Buckling not determinable") && err.contains("within round-off"), "{err}");
    }

    let p_above = 2000.0 * 2.0f64.powi(-44);
    let expected = one_element_cantilever_factor(200000.0 * 1000.0 * 1e-12, 10.0, p_above);
    let above_2d = separate_column_and_tie_2d(p_above, Some(1.0), vec![mpc_2d]);
    let above_3d = separate_column_and_tie_3d(p_above, Some(1.0), vec![mpc_3d]);
    let system = buckling_system_2d(&above_2d).unwrap();
    assert!(system.cs.as_ref().unwrap().n_free_indep < system.dof_num.n_free);
    let system = buckling_system_3d(&above_3d).unwrap();
    assert!(system.cs.as_ref().unwrap().n_free_indep < system.dof_num.n_free);
    for (name, lambda) in [
        ("2d plain", solve_buckling_2d(&above_2d, 1).unwrap().modes[0].load_factor),
        ("2d certified", certify_buckling_2d(&above_2d, 1).unwrap().results.modes[0].load_factor),
        ("3d plain", solve_buckling_3d(&above_3d, 1).unwrap().modes[0].load_factor),
        ("3d certified", certify_buckling_3d(&above_3d, 1).unwrap().results.modes[0].load_factor),
    ] {
        assert!(
            (lambda / expected - 1.0).abs() < 1e-4,
            "{name}: λ = {lambda}, expected {expected}"
        );
    }
}

#[test]
fn issue_1756_omitted_member_mode_check_uses_component_round_off_bound() {
    let constrained_2d: SolverInput = serde_json::from_str(include_str!("../fixtures/buckling-1756-omitted-member.json")).unwrap();
    let mut unconstrained_2d = constrained_2d.clone();
    unconstrained_2d.constraints.clear();

    let mut constrained_3d = embed_2d(&unconstrained_2d, Plane::XZ).unwrap();
    constrained_3d.constraints = serde_json::from_value(serde_json::json!([{
        "type": "linearMPC",
        "terms": [
            {"nodeId": 5, "dof": 4, "coefficient": 1.0},
            {"nodeId": 6, "dof": 4, "coefficient": -1.0}
        ]
    }]))
    .unwrap();

    let plane_system = buckling_system_2d(&constrained_2d).unwrap();
    let space_system = buckling_system_3d(&constrained_3d).unwrap();
    assert!(plane_system.neg_kg_round_off_csc.is_some());
    assert!(space_system.neg_kg_round_off_csc.is_some());
    assert!(plane_system.cs.as_ref().unwrap().n_free_indep < plane_system.dof_num.n_free);
    assert!(space_system.cs.as_ref().unwrap().n_free_indep < space_system.dof_num.n_free);
    for (mean_n, noise) in [(&plane_system.mean_n, &plane_system.axial_noise), (&space_system.mean_n, &space_system.axial_noise)] {
        assert_eq!(mean_n[&4], 0.0);
        assert!(noise[&4] > 0.0 && mean_n[&4].abs() <= noise[&4]);
    }
    let expected = one_element_cantilever_factor(200000.0 * 1000.0 * 1e-12, 10.0, 1e-9);
    for (name, lambda, omitted, diagnostics) in {
        let plane = solve_buckling_2d(&constrained_2d, 1).unwrap();
        let plane_cert = certify_buckling_2d(&constrained_2d, 1).unwrap().results;
        let space = solve_buckling_3d(&constrained_3d, 1).unwrap();
        let space_cert = certify_buckling_3d(&constrained_3d, 1).unwrap().results;
        [
            ("2d plain", plane.modes[0].load_factor, !plane.element_data.iter().any(|e| e.element_id == 4), plane.structured_diagnostics),
            ("2d certified", plane_cert.modes[0].load_factor, !plane_cert.element_data.iter().any(|e| e.element_id == 4), plane_cert.structured_diagnostics),
            ("3d plain", space.modes[0].load_factor, !space.element_data.iter().any(|e| e.element_id == 4), space.structured_diagnostics),
            ("3d certified", space_cert.modes[0].load_factor, !space_cert.element_data.iter().any(|e| e.element_id == 4), space_cert.structured_diagnostics),
        ]
    } {
        assert!((lambda / expected - 1.0).abs() < 1e-6, "{name}: λ = {lambda}, expected {expected}");
        assert!(omitted, "{name}: unloaded stub must be omitted");
        assert!(!diagnostics.iter().any(|d| d.phase.as_deref() == Some("BU-UNRESOLVED-MODE")), "{name}: {diagnostics:?}");
    }
}

#[test]
fn coupled_constraint_propagates_round_off_bound_across_connected_members() {
    let build = |p: f64| -> (SolverInput, SolverInput3D, SolverInput3D) {
        let mut s2 = separate_column_and_tie_2d(
            p,
            None,
            vec![serde_json::json!({"type": "equalDOF", "masterNode": 4, "slaveNode": 1, "dofs": [0]})],
        );
        s2.supports.get_mut("1").unwrap().support_type = "guidedX".into();

        let mut u2 = s2.clone();
        u2.constraints.clear();
        let mut s3_equal = embed_2d(&u2, Plane::XZ).unwrap();
        s3_equal.constraints = serde_json::from_value(serde_json::json!([
            {"type": "equalDOF", "masterNode": 4, "slaveNode": 1, "dofs": [0]}
        ]))
        .unwrap();

        let mut s3_dia = embed_2d(&u2, Plane::XZ).unwrap();
        s3_dia.nodes.insert("99".into(), SolverNode3D { id: 99, x: 5.0, y: 0.0, z: 0.0 });
        for sup in s3_dia.supports.values_mut() {
            if matches!(sup.node_id, 1 | 4) {
                sup.ry = false;
                sup.rrz = false;
            }
        }
        s3_dia.supports.insert(
            "99".into(),
            SolverSupport3D {
                node_id: 99, rx: false, ry: true, rz: true, rrx: true, rry: true, rrz: true,
                rw: None, kx: None, ky: None, kz: None, krx: None, kry: None, krz: None, kw: None,
                dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
                is_inclined: None, normal_x: None, normal_y: None, normal_z: None,
            },
        );
        s3_dia.constraints = serde_json::from_value(serde_json::json!([
            {"type": "diaphragm", "masterNode": 99, "slaveNodes": [1, 4], "plane": "XY"}
        ]))
        .unwrap();
        (s2, s3_equal, s3_dia)
    };

    let (below_2d, below_3d_eq, below_3d_dia) = build(4.0e-8);
    for err in [
        solve_buckling_2d(&below_2d, 1).unwrap_err(),
        certify_buckling_2d(&below_2d, 1).unwrap_err(),
        solve_buckling_3d(&below_3d_eq, 1).unwrap_err(),
        certify_buckling_3d(&below_3d_eq, 1).unwrap_err(),
        solve_buckling_3d(&below_3d_dia, 1).unwrap_err(),
        certify_buckling_3d(&below_3d_dia, 1).unwrap_err(),
    ] {
        assert!(err.contains("Buckling not determinable") && err.contains("within round-off"), "{err}");
    }

    let p_above = 5.0e-8;
    let expected = one_element_cantilever_factor(200000.0 * 1000.0 * 1e-12, 10.0, p_above);
    let (above_2d, above_3d_eq, above_3d_dia) = build(p_above);
    for (name, lambda) in [
        ("2d plain", solve_buckling_2d(&above_2d, 1).unwrap().modes[0].load_factor),
        ("2d certified", certify_buckling_2d(&above_2d, 1).unwrap().results.modes[0].load_factor),
        ("3d equalDOF plain", solve_buckling_3d(&above_3d_eq, 1).unwrap().modes[0].load_factor),
        ("3d equalDOF certified", certify_buckling_3d(&above_3d_eq, 1).unwrap().results.modes[0].load_factor),
        ("3d diaphragm plain", solve_buckling_3d(&above_3d_dia, 1).unwrap().modes[0].load_factor),
        ("3d diaphragm certified", certify_buckling_3d(&above_3d_dia, 1).unwrap().results.modes[0].load_factor),
    ] {
        assert!((lambda / expected - 1.0).abs() < 1e-6, "{name}: λ = {lambda}, expected {expected}");
    }
}

#[test]
fn issue_959_buckling_refuses_compression_recovered_only_from_roundoff() {
    let solver: SolverInput = serde_json::from_str(include_str!("../metamorphic_corpus/nightly/issue-959.json")).unwrap();
    for error in [
        solve_buckling_2d(&solver, 3).unwrap_err(),
        certify_buckling_2d(&solver, 3).unwrap_err(),
    ] {
        assert!(
            error.starts_with("Buckling not determinable: every axial compression is within round-off"),
            "{error}"
        );
        assert!(error.contains("element 1") && error.contains("resolvable beyond"), "{error}");
    }
}

#[test]
fn issue_741_buckling_and_certificate_refuse_the_original_roundoff_compression() {
    let solver: SolverInput3D = serde_json::from_str(include_str!("../fixtures/buckling-741.json")).unwrap();
    for error in [
        solve_buckling_3d(&solver, 3).unwrap_err(),
        certify_buckling_3d(&solver, 3).unwrap_err(),
    ] {
        assert!(error.starts_with("Buckling not determinable:"), "{error}");
        assert!(error.contains("element 3") && error.contains("round-off"), "{error}");
    }
}

#[test]
fn nonlinear_analyses_solve_separate_constrained_member_alongside_small_compression() {
    let unconstrained_2d = separate_column_and_tie_2d(1e-9, None, vec![]);
    let constrained_2d = separate_column_and_tie_2d(
        1e-9,
        None,
        vec![serde_json::json!({
            "type": "linearMPC",
            "terms": [
                {"nodeId": 3, "dof": 2, "coefficient": 1.0},
                {"nodeId": 4, "dof": 2, "coefficient": -1.0}
            ]
        })],
    );
    let system = buckling_system_2d(&constrained_2d).unwrap();
    assert!(system.cs.as_ref().unwrap().n_free_indep < system.dof_num.n_free);
    let pd_uncon_2d = pdelta::solve_pdelta_2d(&unconstrained_2d, 20, 1e-10).unwrap();
    let pd_con_2d = pdelta::solve_pdelta_2d(&constrained_2d, 20, 1e-10).unwrap();
    assert!(pd_uncon_2d.converged && pd_con_2d.converged);
    let uz2 = |r: &AnalysisResults| r.displacements.iter().find(|d| d.node_id == 2).unwrap().uz;
    assert!((uz2(&pd_con_2d.results) / uz2(&pd_uncon_2d.results) - 1.0).abs() < 1e-12);

    let cr_uncon_2d = corotational::solve_corotational_2d(&unconstrained_2d, 50, 1e-10, 2, false).unwrap();
    let cr_con_2d = corotational::solve_corotational_2d(&constrained_2d, 50, 1e-10, 2, false).unwrap();
    assert!(cr_uncon_2d.converged && cr_con_2d.converged);
    assert!((uz2(&cr_con_2d.results) / uz2(&cr_uncon_2d.results) - 1.0).abs() < 1e-12);

    let unconstrained_3d = separate_column_and_tie_3d(1e-9, None, vec![]);
    let constrained_3d = separate_column_and_tie_3d(
        1e-9,
        None,
        vec![serde_json::json!({
            "type": "linearMPC",
            "terms": [
                {"nodeId": 3, "dof": 4, "coefficient": 1.0},
                {"nodeId": 4, "dof": 4, "coefficient": -1.0}
            ]
        })],
    );
    let system = buckling_system_3d(&constrained_3d).unwrap();
    assert!(system.cs.as_ref().unwrap().n_free_indep < system.dof_num.n_free);
    let pd_uncon_3d = pdelta::solve_pdelta_3d(&unconstrained_3d, 20, 1e-10).unwrap();
    let pd_con_3d = pdelta::solve_pdelta_3d(&constrained_3d, 20, 1e-10).unwrap();
    assert!(pd_uncon_3d.converged && pd_con_3d.converged);
    let uz3 = |r: &AnalysisResults3D| r.displacements.iter().find(|d| d.node_id == 2).unwrap().uz;
    assert!((uz3(&pd_con_3d.results) / uz3(&pd_uncon_3d.results) - 1.0).abs() < 1e-12);

    let cr_uncon_3d = corotational::solve_corotational_3d(&unconstrained_3d, 50, 1e-10, 2, false).unwrap();
    let cr_con_3d = corotational::solve_corotational_3d(&constrained_3d, 50, 1e-10, 2, false).unwrap();
    assert!(cr_uncon_3d.converged && cr_con_3d.converged);
    assert!((uz3(&cr_con_3d.results) / uz3(&cr_uncon_3d.results) - 1.0).abs() < 1e-12);
}

#[test]
fn unconstrained_shared_free_warping_propagates_round_off_only_until_compression_is_resolved() {
    let build = |p: f64, shared: bool| {
        let mut input: SolverInput3D = serde_json::from_str(include_str!("../fixtures/buckling-shared-free-warping.json")).unwrap();
        let SolverLoad3D::Nodal(load) = &mut input.loads[0] else { panic!("nodal load") };
        load.fz = -p;
        input.supports.get_mut("1").unwrap().rw = Some(!shared);
        assert!(input.constraints.is_empty());
        input
    };
    let mut transverse = build(0.0, true);
    transverse.nodes.get_mut("2").unwrap().x = 6.0;
    transverse.nodes.get_mut("2").unwrap().z = 8.0;
    transverse.elements.get_mut("1").unwrap().section_id = 2;
    let SolverLoad3D::Nodal(load) = &mut transverse.loads[0] else { panic!("nodal load") };
    load.fx = 8e6;
    load.fz = -6e6;
    assert_eq!(load.fx * 6.0 + load.fz * 8.0, 0.0);
    let linear = dedaliano_engine::solver::linear::solve_3d(&transverse).unwrap();
    let tip = linear.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let recovered = 200000.0 * 1000.0 * 0.01 * ((tip.ux * 6.0 / 10.0 + tip.uz * 8.0 / 10.0) / 10.0);
    let displacement_noise = 100.0 * f64::EPSILON * 200000.0 * 1000.0 * 0.01 * ((tip.ux * 0.6).abs() + (tip.uz * 0.8).abs()) / 10.0;
    assert!(recovered < 0.0 && recovered.abs() < displacement_noise, "recovered {recovered}, noise {displacement_noise}");
    for error in [solve_buckling_3d(&transverse, 1).unwrap_err(), certify_buckling_3d(&transverse, 1).unwrap_err()] {
        assert!(error.contains("every axial compression is within round-off"), "{error}");
    }
    let below = build(4e-8, true);
    for error in [solve_buckling_3d(&below, 1).unwrap_err(), certify_buckling_3d(&below, 1).unwrap_err()] {
        assert!(error.contains("every axial compression is within round-off"), "{error}");
    }
    for (p, shared) in [(5e-8, true), (4e-8, false)] {
        let input = build(p, shared);
        let system = buckling_system_3d(&input).unwrap();
        let ordinary = (0..6).map(|d| system.dof_num.global_dof(1, d).unwrap());
        assert!(ordinary.into_iter().all(|d| d >= system.dof_num.n_free));
        assert_eq!(system.dof_num.global_dof(1, 6).unwrap() < system.dof_num.n_free, shared);
        if shared {
            assert_eq!(system.axial_noise[&1], system.axial_noise[&2]);
        } else {
            assert!(system.axial_noise[&1] < system.axial_noise[&2]);
        }
        assert!(system.mean_n[&1] < -system.axial_noise[&1]);
        let expected = one_element_cantilever_factor(200000.0 * 1000.0 * 1e-12, 10.0, p);
        for factor in [solve_buckling_3d(&input, 1).unwrap().modes[0].load_factor, certify_buckling_3d(&input, 1).unwrap().results.modes[0].load_factor] {
            assert!((factor / expected - 1.0).abs() < 1e-6, "λ = {factor}, expected {expected}");
        }
    }
}
