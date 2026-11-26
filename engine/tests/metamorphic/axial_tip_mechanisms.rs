use crate::{ana2, case::Case2};
use dedaliano_engine::metamorphic::{relabel::Relabel, reversal::reverse_2d, transform::Iso2, units::Units};
use serde_json::Value;

const FIXTURES: &str = include_str!("../fixtures/axial-tip-mechanisms.json");
const UNITS: [(f64, f64); 3] = [(1e-3, 1e3), (25.0, 1e-2), (0.3048, 4.448)];

fn archived(issue: &str) -> Case2 {
    let models: Value = serde_json::from_str(FIXTURES).unwrap();
    Case2::new("replay", serde_json::from_value(models[issue].clone()).unwrap())
}

fn replay(issue: &str, name: &str, seed: u64) {
    let case = archived(issue);
    let a = ana2::rows().into_iter().find(|a| a.name == name).unwrap();
    let mut images = vec![
        case.clone(),
        case.iso(&Iso2::rotation(0.7).translated(1.0, 2.0)).unwrap(),
        case.iso(&Iso2::mirror_x()).unwrap(),
        case.relabel(&Relabel::random_2d(&case.s, seed), seed),
        Case2 { s: reverse_2d(&case.s, &|_| true), ..case.clone() },
    ];
    images.extend(UNITS.map(|(l, f)| case.units(&Units::froude(l, f))));
    let wrong: Vec<_> = images.iter().enumerate().filter_map(|(i, image)| {
        match (a.run)(image) {
            Err(error) if error.contains("the structure is a mechanism") => None,
            Err(error) => Some((i, error)),
            Ok(_) => Some((i, "returned displacements for a free transverse tip".to_owned())),
        }
    }).collect();
    assert!(wrong.is_empty(), "#{issue} {name} {wrong:?}");
}

#[test]
fn issue_964_ssi_refuses_an_axial_member_with_a_free_tip() {
    replay("964", "SSI (no soil springs)", 2026103102530);
}

#[test]
fn issue_967_gapless_contact_refuses_an_axial_member_with_a_free_tip() {
    replay("967", "contact (no gaps)", 2026103100170);
}

#[test]
fn issue_1008_corotational_refuses_the_unstressed_transverse_mechanism() {
    replay("1008", "corotational", 2026110100526);
}

#[test]
fn issue_1112_fiber_refuses_the_free_tip_of_an_elastic_truss() {
    replay("1112", "fiber nonlinear", 2026110201488);
}

fn planar(control: bool) -> Case2 {
    let mut case = archived("967");
    if control {
        case.s.nodes.get_mut("2").unwrap().z = case.s.nodes["1"].z;
        case.s.supports.insert("2".into(), serde_json::from_value(serde_json::json!({
            "id": 2, "nodeId": 2, "type": "rollerX"
        })).unwrap());
        case.s.loads.push(serde_json::from_value(serde_json::json!({
            "type": "nodal", "data": {"nodeId": 2, "fx": 1.0, "fz": 0.0, "my": 0.0}
        })).unwrap());
    }
    case
}

fn planar_fiber_control() -> Case2 {
    let mut case = planar(true);
    case.s.supports.get_mut("1").unwrap().support_type = "fixed".into();
    let mut node = case.s.nodes["1"].clone();
    node.id = 3;
    node.z += (case.s.nodes["2"].x - node.x).abs();
    case.s.nodes.insert("3".into(), node);
    let mut frame = case.s.elements["1"].clone();
    frame.id = 2;
    frame.node_j = 3;
    frame.elem_type = "frame".into();
    case.s.elements.insert("2".into(), frame);
    let dedaliano_engine::types::SolverLoad::Nodal(load) = &mut case.s.loads[0] else { unreachable!() };
    load.node_id = 3;
    case
}

fn spatial_fiber_control() -> crate::case::Case3 {
    let mut case = planar_fiber_control();
    case.s.nodes.get_mut("3").unwrap().x = case.s.nodes["1"].x - 1.0;
    case.s.nodes.get_mut("3").unwrap().z = case.s.nodes["1"].z;
    let mut spatial = spatial_from_planar(&case, true);
    spatial.s.elements.remove("1");
    spatial.s.nodes.remove("2");
    spatial.s.supports.remove("2");
    spatial
}

fn spatial(control: bool) -> crate::case::Case3 {
    spatial_from_planar(&planar(control), control)
}

fn spatial_from_planar(planar: &Case2, control: bool) -> crate::case::Case3 {
    let mut model = serde_json::to_value(&planar.s).unwrap();
    for member in model["elements"].as_object_mut().unwrap().values_mut() {
        let member = member.as_object_mut().unwrap();
        member.remove("hingeStart");
        member.remove("hingeEnd");
    }
    for node in model["nodes"].as_object_mut().unwrap().values_mut() {
        node["y"] = serde_json::json!(0.0);
    }
    model["nodes"]["1"]["y"] = serde_json::json!(0.0);
    model["nodes"]["2"]["y"] = serde_json::json!(if control {0.0} else {1.0});
    for section in model["sections"].as_object_mut().unwrap().values_mut() {
        section["iy"] = section["iz"].clone();
        section["j"] = section["iz"].clone();
    }
    model["supports"] = serde_json::json!({
        "1": { "nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true }
    });
    if control {
        model["supports"]["2"] = serde_json::json!({
            "nodeId": 2, "rx": false, "ry": true, "rz": true, "rrx": false, "rry": false, "rrz": false
        });
        let load = &mut model["loads"][0]["data"];
        for key in ["fy", "mx", "mz"] { load[key] = serde_json::json!(0.0); }
    }
    crate::case::Case3::new("axial tip", serde_json::from_value(model).unwrap())
}

fn assert_verdict(result: Result<crate::response::Resp, String>, control: bool, name: &str) {
    if control {
        let result = result.unwrap_or_else(|e| panic!("{name}: {e}"));
        assert!(result.0.iter().any(|r| r.tag == "u" && r.v.iter().any(|v| *v != 0.0)), "{name}");
    } else {
        let error = result.err().unwrap_or_else(|| panic!("{name} returned a mechanism"));
        assert!(error.contains("the structure is a mechanism"), "{name}: {error}");
    }
}

#[test]
fn axial_tip_mechanism_survives_static_and_nonlinear_dispatch_in_both_dimensions() {
    let rows_2d = ana2::rows();
    let rows_3d = crate::ana3::rows();
    let names = [
        "linear", "linear (sparse path)", "linear (PCG)", "linear (load session)",
        "constrained", "certified linear", "staged (one stage)",
        "SSI (no soil springs)", "contact (no gaps)", "corotational", "fiber nonlinear",
    ];
    for control in [false, true] {
        let p = planar(control);
        let s = spatial(control);
        let fiber_p = if control { planar_fiber_control() } else { p.clone() };
        let fiber_s = if control { spatial_fiber_control() } else { s.clone() };
        for name in names {
            let a = rows_2d.iter().find(|a| a.name == name).unwrap();
            assert_verdict((a.run)(if name == "fiber nonlinear" { &fiber_p } else { &p }), control, &format!("2D {name}"));
            let a = rows_3d.iter().find(|a| a.name == name).unwrap();
            assert_verdict((a.run)(if name == "fiber nonlinear" { &fiber_s } else { &s }), control, &format!("3D {name}"));
        }
        for (length, force) in UNITS {
            let units = Units::froude(length, force);
            let s = s.units(&units);
            let fiber_s = fiber_s.units(&units);
            for name in ["linear", "SSI (no soil springs)", "contact (no gaps)", "corotational", "fiber nonlinear"] {
                let a = rows_3d.iter().find(|a| a.name == name).unwrap();
                assert_verdict((a.run)(if name == "fiber nonlinear" { &fiber_s } else { &s }), control, &format!("3D {name} {length}/{force}"));
            }
        }
    }
}

#[test]
fn an_unstressed_axial_tip_is_rejected_before_arc_length_prediction() {
    let s = archived("1008").s;
    let input = serde_json::from_value(serde_json::json!({
        "solver": s, "maxSteps": 1,
    })).unwrap();
    let result = dedaliano_engine::solver::arc_length::solve_arc_length(&input);
    assert!(result.err().unwrap().contains("the structure is a mechanism"));
}

#[test]
fn a_prestretched_axial_tip_can_continue_in_corotational_analysis() {
    use dedaliano_engine::solver::{corotational, linear};
    let mut target = planar(true).s;
    let mut start = target.clone();
    let span = target.nodes["2"].x - target.nodes["1"].x;
    let extension = span * 1e-3;
    let axial = target.materials["1"].e * 1e3 * target.sections["2"].a * extension / span.abs();
    let dedaliano_engine::types::SolverLoad::Nodal(load) = &mut target.loads[0] else { unreachable!() };
    load.fx = axial;
    start.loads = target.loads.clone();
    start.supports.get_mut("2").unwrap().support_type = "pinned".into();
    start.supports.get_mut("2").unwrap().dx = Some(extension);
    target.supports.remove("2");
    let solved = linear::solve_2d(&start).unwrap();
    let continuation = corotational::CorotationalStart2D { input: &start, displacements: &solved.displacements };
    let r = corotational::solve_corotational_2d_from(&target, Some(&continuation), 100, 1e-10, 4, false).unwrap();
    assert!(r.converged);
    let tip = r.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_eq!(tip.ux, extension);
}

#[test]
fn axial_tip_wasm_cases() {
    let Ok(path) = std::env::var("AXIAL_TIP_WASM_CASES") else { return };
    let mut rows = Vec::new();
    for (issue, api) in [("964", "ssi"), ("967", "contact"), ("1008", "corotational"), ("1112", "fiber_nonlinear")] {
        let case = archived(issue);
        for (l, f) in [(1.0,1.0), UNITS[0], UNITS[1], UNITS[2]] {
            rows.push(serde_json::json!({
                "dimension": 2, "solver": case.units(&Units::froude(l,f)).s, "api": api, "control": false,
            }));
        }
    }
    for control in [false, true] {
        for (dimension, solver) in [
            (2, serde_json::to_value(planar(control).s).unwrap()),
            (3, serde_json::to_value(spatial(control).s).unwrap()),
        ] {
            for api in ["linear", "ssi", "contact", "corotational", "fiber_nonlinear"] {
                let solver = if control && api == "fiber_nonlinear" {
                    let case = planar_fiber_control();
                    if dimension == 2 { serde_json::to_value(case.s).unwrap() }
                    else { serde_json::to_value(spatial_fiber_control().s).unwrap() }
                } else { solver.clone() };
                rows.push(serde_json::json!({ "dimension": dimension, "solver": solver, "api": api, "control": control }));
            }
        }
    }
    rows.push(serde_json::json!({ "dimension": 2, "solver": archived("1008").s, "api": "arc_length", "control": false }));
    std::fs::write(path, serde_json::to_vec(&rows).unwrap()).unwrap();
}

#[test]
fn a_tip_attachment_can_supply_the_missing_transverse_stiffness() {
    use dedaliano_engine::solver::{contact, ssi};
    let mut solver = planar(true).s;
    solver.supports.remove("2");
    let dedaliano_engine::types::SolverLoad::Nodal(load) = &mut solver.loads[0] else { unreachable!() };
    load.fz = -1.0;
    let ssi_input = serde_json::from_value(serde_json::json!({
        "solver": solver,
        "soilSprings": [{"nodeId": 2, "direction": 1, "tributaryLength": 1.0,
            "curve": {"type": "custom", "points": [[0.0, 0.0], [1.0, 100.0]]}}],
        "maxIter": 50,
        "tolerance": 1e-10,
    })).unwrap();
    let settled = ssi::solve_ssi_2d(&ssi_input).unwrap();
    assert!(settled.converged && settled.results.displacements.iter().any(|d| d.node_id == 2 && d.uz < 0.0));
    solver.supports.insert("2".into(), serde_json::from_value(serde_json::json!({
        "id": 2, "nodeId": 2, "type": "spring", "ky": 10.0,
    })).unwrap());
    let contact_input = serde_json::from_value(serde_json::json!({
        "solver": solver, "gapElements": [{"id": 1, "nodeI": 1, "nodeJ": 2, "direction": 1,
            "initialGap": -0.01, "stiffness": 100.0}],
    })).unwrap();
    let touched = contact::solve_contact_2d(&contact_input).unwrap();
    assert!(touched.converged && touched.results.displacements.iter().any(|d| d.node_id == 2 && d.ux != 0.0));
}
