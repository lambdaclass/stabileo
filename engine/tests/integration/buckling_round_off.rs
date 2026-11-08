use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};
use dedaliano_engine::metamorphic::transform::{transform_2d, Iso2};
use dedaliano_engine::metamorphic::units::{
    scale_2d, scale_3d, scale_load_2d, scale_load_3d, Units,
};
use dedaliano_engine::solver::buckling::{solve_buckling_2d, solve_buckling_3d};
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
