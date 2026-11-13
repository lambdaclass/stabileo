use dedaliano_engine::metamorphic::transform::{transform_3d, Iso3};
use dedaliano_engine::metamorphic::units::{scale_3d, Units};
use dedaliano_engine::solver::{linear, stability};
use dedaliano_engine::types::*;
use serde_json::{json, Value};

fn fixture() -> Value {
    serde_json::from_str::<Value>(include_str!("../fixtures/nightly-2026-11-13.json")).unwrap()
        ["2023"]
        .clone()
}

fn member(axis: &str, end: &str, oblique: bool) -> SolverInput3D {
    let mut v = fixture();
    v["nodes"] = json!({"1":{"id":1,"x":0.0,"y":0.0,"z":0.0},"2":{"id":2,"x":3.0,"y":if oblique {4.0} else {0.0},"z":if oblique {2.0} else {0.0}}});
    let mut e = v["elements"]["1"].clone();
    e["nodeI"] = json!(1);
    e["nodeJ"] = json!(2);
    e[format!("release{axis}{end}")] = json!(true);
    v["elements"] = json!({"1":e});
    let free = if end == "Start" { "1" } else { "2" };
    let held = if end == "Start" { "2" } else { "1" };
    v["supports"] = json!({free:{"nodeId":free.parse::<usize>().unwrap(),"rx":true,"ry":true,"rz":true,"rrx":false,"rry":false,"rrz":false},held:{"nodeId":held.parse::<usize>().unwrap(),"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}});
    v["loads"] = json!([{"type":"pointOnElement","data":{"elementId":1,"a":0.5,"px":0.0,"py":1.0,"pz":-1.0}}]);
    serde_json::from_value(v).unwrap()
}

fn transforms(s: &SolverInput3D) -> Vec<SolverInput3D> {
    [
        Iso3::from_euler(0.0, 0.0, 0.0),
        Iso3::from_euler(0.3, -0.7, 1.1),
        Iso3::from_euler(-1.2, 0.4, 0.8),
    ]
    .iter()
    .flat_map(|r| {
        let rotated = transform_3d(s, r).unwrap();
        [(1.0, 1.0), (0.001, 1000.0), (1000.0, 0.001)]
            .map(|(l, f)| scale_3d(&rotated, &Units::froude(l, f)))
    })
    .collect()
}

#[test]
fn compatible_3d_release_axes_ends_rotations_and_units() {
    for axis in ["My", "Mz", "T"] {
        for end in ["Start", "End"] {
            for oblique in [false, true] {
                for s in transforms(&member(axis, end, oblique)) {
                    let r = linear::solve_3d(&s)
                        .unwrap_or_else(|e| panic!("{axis}/{end}/{oblique}: {e}"));
                    assert_eq!(r.displacements.len(), 2);
                    assert_eq!(r.element_forces.len(), 1);
                    assert!(r
                        .element_forces
                        .iter()
                        .any(|f| f.vy_start != 0.0 || f.vz_start != 0.0));
                }
            }
        }
    }
}

#[test]
fn compatible_3d_units_boundary_guard() {
    let s: SolverInput3D = serde_json::from_value(fixture()).unwrap();
    for length in [0.001, 1.0, 1000.0] {
        for force in [0.001, 1.0, 1000.0] {
            let s = scale_3d(&s, &Units::froude(length, force));
            let result = linear::solve_3d(&s).unwrap();
            assert_eq!(result.displacements.len(), s.nodes.len());
            assert_eq!(result.element_forces.len(), s.elements.len());
        }
    }
}

#[test]
fn genuine_3d_released_moments_are_refused_in_every_frame_and_unit() {
    for axis in ["My", "Mz", "T"] {
        for end in ["Start", "End"] {
            for s in transforms(&member(axis, end, true)) {
                let e = &s.elements["1"];
                let a = &s.nodes["1"];
                let b = &s.nodes["2"];
                let (ex, ey, ez) = dedaliano_engine::element::compute_local_axes_3d(
                    a.x,
                    a.y,
                    a.z,
                    b.x,
                    b.y,
                    b.z,
                    e.local_yx,
                    e.local_yy,
                    e.local_yz,
                    e.roll_angle,
                    false,
                );
                let d = match axis {
                    "My" => ey,
                    "Mz" => ez,
                    _ => ex,
                };
                let node = if end == "Start" { 1 } else { 2 };
                let st = stability::of_3d(&s).unwrap();
                assert!(st.free_rotations().any(|d| d.node == node));
                let scale = (b.x - a.x).hypot(b.y - a.y).hypot(b.z - a.z)
                    * match &s.loads[0] {
                        SolverLoad3D::PointOnElement(p) => p.py.abs() + p.pz.abs(),
                        _ => unreachable!(),
                    };
                for magnitude in [
                    scale,
                    scale * (2.0 * 14.0 * f64::EPSILON / (1.0 - 2.0 * 14.0 * f64::EPSILON)),
                ] {
                    let mut bad = s.clone();
                    bad.loads.push(serde_json::from_value(json!({"type":"nodal","data":{"nodeId":node,"fx":0.0,"fy":0.0,"fz":0.0,"mx":magnitude*d[0],"my":magnitude*d[1],"mz":magnitude*d[2]}})).unwrap());
                    assert!(linear::solve_3d(&bad).is_err(), "{axis}/{end}/{magnitude}");
                }
            }
        }
    }
}

fn entry_names() -> [&'static str; 17] {
    [
        "linear",
        "linear (load session)",
        "linear (sparse path)",
        "linear (PCG)",
        "constrained",
        "certified linear",
        "load combinations",
        "staged (one stage)",
        "staged (loads in two stages)",
        "Winkler (no foundation)",
        "contact (no gaps)",
        "SSI (no soil springs)",
        "creep & shrinkage (t = t0)",
        "corotational",
        "material nonlinear",
        "cable solver",
        "plastic collapse",
    ]
}

#[test]
fn compatible_3d_load_reaches_every_static_entry_point() {
    let models = transforms(&member("Mz", "Start", true));
    let mut failures = Vec::new();
    for name in entry_names() {
        let adapter = crate::ana3::rows()
            .into_iter()
            .find(|a| a.name == name)
            .unwrap();
        for (i, s) in models.iter().enumerate() {
            let case = crate::case::Case3::new("released work", s.clone());
            match (adapter.run)(&case) {
                Ok(r) => assert!(!r.0.is_empty(), "{name}/{i}"),
                Err(e) => failures.push(format!("{name}/{i}: {e}")),
            }
            let (a, b, e) = (&s.nodes["1"], &s.nodes["2"], &s.elements["1"]);
            let (_, retained_axis, d) = dedaliano_engine::element::compute_local_axes_3d(
                a.x,
                a.y,
                a.z,
                b.x,
                b.y,
                b.z,
                e.local_yx,
                e.local_yy,
                e.local_yz,
                e.roll_angle,
                false,
            );
            let length = (b.x - a.x).hypot(b.y - a.y).hypot(b.z - a.z);
            let load = match &s.loads[0] {
                SolverLoad3D::PointOnElement(p) => p.py.abs() + p.pz.abs(),
                _ => unreachable!(),
            };
            let magnitude = length * load * f64::EPSILON.sqrt();
            let mut retained = s.clone();
            retained.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: 1,
                fx: 0.0,
                fy: 0.0,
                fz: 0.0,
                mx: magnitude * retained_axis[0],
                my: magnitude * retained_axis[1],
                mz: magnitude * retained_axis[2],
                bw: None,
            }));
            match (adapter.run)(&crate::case::Case3::new("retained nodal work 3d", retained)) {
                Ok(r) => assert!(!r.0.is_empty(), "{name}/{i}/retained"),
                Err(e) => failures.push(format!("{name}/{i}/retained: {e}")),
            }
            for magnitude in [
                length * load,
                length * load * (2.0 * 14.0 * f64::EPSILON / (1.0 - 2.0 * 14.0 * f64::EPSILON)),
            ] {
                let mut bad = s.clone();
                bad.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                    node_id: 1,
                    fx: 0.0,
                    fy: 0.0,
                    fz: 0.0,
                    mx: magnitude * d[0],
                    my: magnitude * d[1],
                    mz: magnitude * d[2],
                    bw: None,
                }));
                assert!(
                    (adapter.run)(&crate::case::Case3::new("unsupported work 3d", bad)).is_err(),
                    "{name}/{i}/{magnitude}"
                );
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

fn member_2d(end: &str) -> SolverInput {
    let mut v = fixture();
    v["nodes"] = json!({"1":{"id":1,"x":0.0,"z":0.0},"2":{"id":2,"x":3.0,"z":2.0}});
    v["elements"] = json!({"1":{"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1,"hingeStart":end=="Start","hingeEnd":end=="End"}});
    let free = if end == "Start" { 1 } else { 2 };
    let held = 3 - free;
    v["supports"] = json!({free.to_string():{"id":free,"nodeId":free,"type":"pinned"},held.to_string():{"id":held,"nodeId":held,"type":"fixed"}});
    v["loads"] = json!([{"type":"pointOnElement","data":{"elementId":1,"a":0.5,"p":1.0}}]);
    serde_json::from_value(v).unwrap()
}

#[test]
fn compatible_2d_load_and_genuine_moment_controls_cover_entry_points() {
    use dedaliano_engine::metamorphic::transform::{transform_2d, Iso2};
    use dedaliano_engine::metamorphic::units::scale_2d;
    for end in ["Start", "End"] {
        for angle in [0.0, 0.3, -1.2] {
            for units in [
                Units::froude(1.0, 1.0),
                Units::froude(0.001, 1000.0),
                Units::froude(1000.0, 0.001),
            ] {
                let s = scale_2d(
                    &transform_2d(&member_2d(end), &Iso2::rotation(angle)).unwrap(),
                    &units,
                );
                for name in entry_names()
                    .into_iter()
                    .filter(|n| *n != "plastic collapse")
                {
                    let adapter = crate::ana2::rows()
                        .into_iter()
                        .find(|a| a.name == name)
                        .unwrap();
                    let r = (adapter.run)(&crate::case::Case2::new("released work 2d", s.clone()))
                        .unwrap_or_else(|e| panic!("{name}/{end}/{angle}/{units:?}: {e}"));
                    assert!(!r.0.is_empty(), "{name}");
                    for factor in [1.0, f64::EPSILON] {
                        let mut bad = s.clone();
                        bad.loads.push(SolverLoad::Nodal(SolverNodalLoad {
                            node_id: if end == "Start" { 1 } else { 2 },
                            fx: 0.0,
                            fz: 0.0,
                            my: units.moment() * factor,
                        }));
                        assert!(
                            (adapter.run)(&crate::case::Case2::new("unsupported work 2d", bad))
                                .is_err(),
                            "{name}/{factor}"
                        );
                    }
                }
            }
        }
    }
}

#[test]
fn native_and_wasm_share_released_load_models() {
    let mut cases = Vec::new();
    for end in ["Start", "End"] {
        for angle in [0.0, 0.3, -1.2] {
            for units in [
                Units::froude(1.0, 1.0),
                Units::froude(0.001, 1000.0),
                Units::froude(1000.0, 0.001),
            ] {
                let model = dedaliano_engine::metamorphic::units::scale_2d(
                    &dedaliano_engine::metamorphic::transform::transform_2d(
                        &member_2d(end),
                        &dedaliano_engine::metamorphic::transform::Iso2::rotation(angle),
                    )
                    .unwrap(),
                    &units,
                );
                cases.push(json!({"dim":2,"model":model,"node":if end=="Start" {1} else {2},"scale":units.moment()}));
            }
        }
        for (first, second, retained) in [
            ("My", None, None),
            ("Mz", None, None),
            ("T", None, None),
            ("My", Some("Mz"), Some(0)),
            ("T", Some("My"), Some(2)),
            ("T", Some("Mz"), Some(1)),
        ] {
            for oblique in [false, true] {
                let source = second.map_or_else(
                    || member(first, end, oblique),
                    |second| release_pair(first, second, end, oblique),
                );
                for mut model in transforms(&source) {
                    let (a, b, e) = (&model.nodes["1"], &model.nodes["2"], &model.elements["1"]);
                    let (ex, ey, ez) = dedaliano_engine::element::compute_local_axes_3d(
                        a.x,
                        a.y,
                        a.z,
                        b.x,
                        b.y,
                        b.z,
                        e.local_yx,
                        e.local_yy,
                        e.local_yz,
                        e.roll_angle,
                        false,
                    );
                    let direction = match first {
                        "My" => ey,
                        "Mz" => ez,
                        _ => ex,
                    };
                    let scale = (b.x - a.x).hypot(b.y - a.y).hypot(b.z - a.z)
                        * match &model.loads[0] {
                            SolverLoad3D::PointOnElement(p) => p.py.abs() + p.pz.abs(),
                            _ => unreachable!(),
                        };
                    let node = if end == "Start" { 1 } else { 2 };
                    if let Some(index) = retained {
                        let retained = [ex, ey, ez][index];
                        let m = scale * f64::EPSILON.sqrt();
                        model.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                            node_id: node,
                            fx: 0.0,
                            fy: 0.0,
                            fz: 0.0,
                            mx: m * retained[0],
                            my: m * retained[1],
                            mz: m * retained[2],
                            bw: None,
                        }));
                    }
                    cases.push(json!({"dim":3,"model":model,"node":node,"direction":direction,"scale":scale}));
                }
            }
        }
    }
    if let Ok(path) = std::env::var("RELEASED_LOAD_CASES") {
        for c in &mut cases {
            c["references"] = native_references(c["dim"].as_u64().unwrap(), &c["model"]);
            c["gauges"] = released_gauges(c["dim"].as_u64().unwrap(), &c["model"]);
        }
        let exact: Value =
            serde_json::from_str(include_str!("../fixtures/released-load-work-2023.json")).unwrap();
        let exact: Vec<_> = exact.as_object().unwrap().iter().map(|(name, model)| json!({"name":name,"model":model,"references":native_references(3, model),"gauges":released_gauges(3, model)})).collect();
        std::fs::write(path, serde_json::to_vec(&json!({"cases":cases,"exact":exact,"orphanTranslations":orphan_translation_models(),"cancellations":cancellation_models_2074().into_iter().map(|mut c| { c["references"] = native_references(c["dim"].as_u64().unwrap(), &c["model"]); c["gauges"] = released_gauges(c["dim"].as_u64().unwrap(), &c["model"]); c }).collect::<Vec<_>>(),"trussCases":truss_models_2074(),"assemblyCases":assembly_models_2074(),"mixedOrphans":mixed_orphan_cases_2074(),"mixedDynamics":mixed_dynamic_cases_2074(),"nearParallel":near_parallel_models_2074().into_iter().map(|mut c| {c["references"]=native_references(3,&c["model"]);c["gauges"]=released_gauges(3,&c["model"]);c["extraReferences"]=near_parallel_extra_references(&c["extraInputs"]);c}).collect::<Vec<_>>()})).unwrap()).unwrap();
    }
    assert_eq!(cases.len(), 234);
}

#[test]
fn pdelta_admits_compatible_released_work_to_its_iterations() {
    for s in transforms(&member("Mz", "Start", true)) {
        let result = dedaliano_engine::solver::pdelta::solve_pdelta_3d(&s, 100, 1e-12).unwrap();
        assert_eq!(result.linear_results.displacements.len(), 2);
        assert_eq!(result.results.element_forces.len(), 1);
    }
}

#[test]
fn fiber_nonlinear_keeps_its_explicit_release_refusal() {
    let adapter = crate::ana3::rows()
        .into_iter()
        .find(|a| a.name == "fiber nonlinear")
        .unwrap();
    let e = (adapter.run)(&crate::case::Case3::new(
        "fiber release contract",
        member("Mz", "Start", true),
    ))
    .unwrap_err();
    assert!(e.contains("does not support member end releases"), "{e}");
}

#[test]
fn contact_without_features_keeps_zero_and_one_iteration_limits() {
    for dimension in [2, 3] {
        for max_iter in [0, 1] {
            if dimension == 2 {
                let input =
                    serde_json::from_value(json!({"solver":member_2d("Start"),"maxIter":max_iter}))
                        .unwrap();
                let r = dedaliano_engine::solver::contact::solve_contact_2d(&input).unwrap();
                assert_eq!(r.converged, max_iter == 1);
                assert!(!r.results.element_forces.is_empty());
            } else {
                let input = serde_json::from_value(
                    json!({"solver":member("Mz","Start",true),"maxIter":max_iter}),
                )
                .unwrap();
                let r = dedaliano_engine::solver::contact::solve_contact_3d(&input).unwrap();
                assert_eq!(r.converged, max_iter == 1);
                assert!(!r.results.element_forces.is_empty());
            }
        }
    }
}

#[test]
fn compatible_released_work_uses_mapped_and_warping_load_assembly() {
    for mut model in transforms(&member("Mz", "Start", true)) {
        let mut node = model.nodes["2"].clone();
        node.id = 3;
        node.x += model.nodes["2"].x - model.nodes["1"].x;
        node.y += model.nodes["2"].y - model.nodes["1"].y;
        node.z += model.nodes["2"].z - model.nodes["1"].z;
        model.nodes.insert("3".into(), node);
        let mut support = model.supports["2"].clone();
        support.node_id = 3;
        model.supports.insert("3".into(), support);
        for support in model.supports.values_mut() {
            support.rw = Some(true);
        }
        let mut section = model.sections["1"].clone();
        section.id = 2;
        let a = &model.nodes["1"];
        let b = &model.nodes["2"];
        let length = (a.x - b.x).hypot(a.y - b.y).hypot(a.z - b.z);
        section.cw = Some(section.j * length * length);
        model.sections.insert("2".into(), section);
        let mut element = model.elements["1"].clone();
        element.id = 2;
        element.node_i = 2;
        element.node_j = 3;
        element.section_id = 2;
        element.release_mz_start = false;
        model.elements.insert("2".into(), element);
        let mut load = model.loads[0].clone();
        if let SolverLoad3D::PointOnElement(p) = &mut load {
            p.element_id = 2;
        }
        model.loads.push(load);
        let result = linear::solve_3d(&model).unwrap();
        assert_eq!(result.element_forces.len(), 2);
        assert_eq!(result.displacements.len(), 3);
    }
}

#[test]
fn compatible_released_work_survives_nonempty_constraint_reduction() {
    let mut input: SolverInput3D = serde_json::from_value(fixture()).unwrap();
    input.supports.get_mut("2").unwrap().rx = true;
    input.supports.get_mut("2").unwrap().rz = true;
    input
        .constraints
        .push(Constraint::EqualDOF(EqualDOFConstraint {
            master_node: 1,
            slave_node: 3,
            dofs: vec![0, 1, 2],
        }));
    for model in transforms(&input) {
        for name in [
            "linear",
            "constrained",
            "staged (one stage)",
            "staged (loads in two stages)",
        ] {
            let adapter = crate::ana3::rows()
                .into_iter()
                .find(|a| a.name == name)
                .unwrap();
            let result = (adapter.run)(&crate::case::Case3::new(
                "constrained released work",
                model.clone(),
            ))
            .unwrap_or_else(|e| panic!("{name}: {e}"));
            assert!(!result.0.is_empty());
        }
    }
}

fn release_pair(first: &str, second: &str, end: &str, oblique: bool) -> SolverInput3D {
    let mut model = member(first, end, oblique);
    let e = model.elements.get_mut("1").unwrap();
    match (second, end) {
        ("My", "Start") => e.release_my_start = true,
        ("My", "End") => e.release_my_end = true,
        ("Mz", "Start") => e.release_mz_start = true,
        ("Mz", "End") => e.release_mz_end = true,
        _ => unreachable!(),
    }
    model
}

#[test]
fn multiple_released_rotations_keep_the_retained_axis_and_refuse_real_work() {
    for (first, second, retained) in [("My", "Mz", 0), ("T", "My", 2), ("T", "Mz", 1)] {
        for end in ["Start", "End"] {
            for oblique in [false, true] {
                for mut model in transforms(&release_pair(first, second, end, oblique)) {
                    let (a, b, e) = (&model.nodes["1"], &model.nodes["2"], &model.elements["1"]);
                    let (ex, ey, ez) = dedaliano_engine::element::compute_local_axes_3d(
                        a.x,
                        a.y,
                        a.z,
                        b.x,
                        b.y,
                        b.z,
                        e.local_yx,
                        e.local_yy,
                        e.local_yz,
                        e.roll_angle,
                        false,
                    );
                    let direction = [ex, ey, ez][retained];
                    let length = (b.x - a.x).hypot(b.y - a.y).hypot(b.z - a.z);
                    let scale = length
                        * match &model.loads[0] {
                            SolverLoad3D::PointOnElement(p) => p.py.abs() + p.pz.abs(),
                            _ => unreachable!(),
                        };
                    let m = scale * f64::EPSILON.sqrt();
                    let node = if end == "Start" { 1 } else { 2 };
                    model.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                        node_id: node,
                        fx: 0.0,
                        fy: 0.0,
                        fz: 0.0,
                        mx: m * direction[0],
                        my: m * direction[1],
                        mz: m * direction[2],
                        bw: None,
                    }));
                    let r = linear::solve_3d(&model)
                        .unwrap_or_else(|e| panic!("{first}/{second}/{end}/{oblique}: {e}"));
                    assert_eq!(r.element_forces.len(), 1);
                    let unsupported = if first == "My" { ey } else { ex };
                    let m = scale * (28.0 * f64::EPSILON / (1.0 - 28.0 * f64::EPSILON));
                    model.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                        node_id: node,
                        fx: 0.0,
                        fy: 0.0,
                        fz: 0.0,
                        mx: m * unsupported[0],
                        my: m * unsupported[1],
                        mz: m * unsupported[2],
                        bw: None,
                    }));
                    assert!(linear::solve_3d(&model).is_err());
                }
            }
        }
    }
}

#[test]
fn an_independent_large_torque_cannot_hide_a_released_bending_moment() {
    let mut model = member("Mz", "Start", false);
    model.elements.get_mut("1").unwrap().roll_angle = Some(0.3 * 180.0 / std::f64::consts::PI);
    model.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 1,
        fx: 0.0,
        fy: 0.0,
        fz: 0.0,
        mx: 1e20,
        my: 0.0,
        mz: 0.0,
        bw: None,
    }));
    assert!(linear::solve_3d(&model).is_ok());
    let e = &model.elements["1"];
    let a = &model.nodes["1"];
    let b = &model.nodes["2"];
    let (_, _, direction) = dedaliano_engine::element::compute_local_axes_3d(
        a.x,
        a.y,
        a.z,
        b.x,
        b.y,
        b.z,
        e.local_yx,
        e.local_yy,
        e.local_yz,
        e.roll_angle,
        false,
    );
    model.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 1,
        fx: 0.0,
        fy: 0.0,
        fz: 0.0,
        mx: 0.0,
        my: direction[1],
        mz: direction[2],
        bw: None,
    }));
    assert!(linear::solve_3d(&model).is_err());
}

#[test]
fn material_nonlinear_retained_moments_use_the_physical_release_check() {
    use dedaliano_engine::solver::material_nonlinear;
    let mut completed = 0;
    for end in ["Start", "End"] {
        for mut model in transforms(&release_pair("T", "Mz", end, true)) {
            let (a, b, e) = (&model.nodes["1"], &model.nodes["2"], &model.elements["1"]);
            let (_, ey, _) = dedaliano_engine::element::compute_local_axes_3d(
                a.x,
                a.y,
                a.z,
                b.x,
                b.y,
                b.z,
                e.local_yx,
                e.local_yy,
                e.local_yz,
                e.roll_angle,
                false,
            );
            let node = if end == "Start" { 1 } else { 2 };
            let magnitude = (b.x - a.x).hypot(b.y - a.y).hypot(b.z - a.z) * f64::EPSILON.sqrt();
            model.loads.push(serde_json::from_value(json!({"type":"nodal","data":{"nodeId":node,"fx":0.0,"fy":0.0,"fz":0.0,"mx":magnitude*ey[0],"my":magnitude*ey[1],"mz":magnitude*ey[2]}})).unwrap());
            let input=serde_json::from_value(json!({"solver":model,"materialModels":{},"sectionCapacities":{},"maxIter":60,"tolerance":1e-10,"nIncrements":4})).unwrap();
            match material_nonlinear::solve_nonlinear_material_3d(&input) {
                Ok(r) => {
                    assert_eq!(r.results.displacements.len(), 2);
                    completed += 1;
                }
                Err(e)
                    if e.starts_with("Singular tangent stiffness")
                        || e.starts_with("Singular stiffness") => {}
                Err(e) => panic!("{end}: {e}"),
            }
        }
    }
    assert!(completed > 0);
}

fn native_references(dim: u64, model: &Value) -> Value {
    use dedaliano_engine::solver::{
        cable, constraints, contact, corotational, material_nonlinear, pdelta, ssi, winkler,
    };
    let wrapper = json!({"solver":model,"soilSprings":[],"foundationSprings":[],"densities":{},"materialModels":{},"sectionCapacities":{},"maxIter":60,"tolerance":1e-10,"nIncrements":4});
    macro_rules! references {
        ($input:ty, $solve:path, $session:ty, $certified:path, $constrained:path, $corot:path, $material:path, $cable:path, $contact:path, $ssi:path, $winkler:path, $pdelta:path, $stage:path, $all:path) => {{
            let s: $input = serde_json::from_value(model.clone()).unwrap();
            let encode = |r| match r { Ok(v) => json!({"ok":v}), Err(e) => json!({"error":e}) };
            let mut refs = serde_json::Map::new();
            refs.insert("linear".into(), encode($solve(&s).map(|r| serde_json::to_value(r).unwrap())));
            refs.insert("session".into(), encode(<$session>::from_input(s.clone()).and_then(|session| session.solve_loads(&s.loads)).map(|r| serde_json::to_value(r).unwrap())));
            refs.insert("certified".into(), encode($certified(&s).map(|r| serde_json::to_value(r.results).unwrap())));
            refs.insert("constrained".into(), encode($constrained(&serde_json::from_value(json!({"solver":s,"constraints":s.constraints})).unwrap()).map(|r| serde_json::to_value(r).unwrap())));
            refs.insert("corotational".into(), encode($corot(&s,100,1e-10,4,false).map(|r| serde_json::to_value(r).unwrap())));
            refs.insert("material".into(), encode($material(&serde_json::from_value(wrapper.clone()).unwrap()).map(|r| serde_json::to_value(r).unwrap())));
            refs.insert("cable".into(), encode($cable(&s,&Default::default(),100,1e-10).map(|r| json!({"results":r.results,"converged":r.converged}))));
            refs.insert("contact".into(), encode($contact(&serde_json::from_value(wrapper.clone()).unwrap()).map(|r| serde_json::to_value(r).unwrap())));
            refs.insert("ssi".into(), encode($ssi(&serde_json::from_value(wrapper.clone()).unwrap()).map(|r| serde_json::to_value(r).unwrap())));
            refs.insert("winkler".into(), encode($winkler(&serde_json::from_value(wrapper.clone()).unwrap()).map(|r| serde_json::to_value(r).unwrap())));
            refs.insert("pdelta".into(), encode($pdelta(&s,100,1e-12).map(|r| serde_json::to_value(r).unwrap())));
            let all = $all(&s,(0..s.loads.len()).collect());
            refs.insert("staged".into(), encode($stage(&s,json!([all])).map(|r| serde_json::to_value(r.final_results).unwrap())));
            let empty = $all(&s,vec![]);
            let second = json!({"name":"loads","elementsAdded":[],"supportsAdded":[],"loadIndices":(0..s.loads.len()).collect::<Vec<_>>()});
            refs.insert("staged-two".into(), encode($stage(&s,json!([empty,second])).map(|r| serde_json::to_value(r.final_results).unwrap())));
            Value::Object(refs)
        }};
    }
    let mut refs = if dim == 2 {
        references!(
            SolverInput,
            linear::solve_2d,
            dedaliano_engine::load_session::LoadSession2D,
            dedaliano_engine::certify::certify_linear_2d_full,
            constraints::solve_constrained_2d,
            corotational::solve_corotational_2d,
            material_nonlinear::solve_nonlinear_material_2d,
            cable::solve_cable_2d,
            contact::solve_contact_2d,
            ssi::solve_ssi_2d,
            winkler::solve_winkler_2d,
            pdelta::solve_pdelta_2d,
            released_stage_2d,
            released_stage_all_2d
        )
    } else {
        references!(
            SolverInput3D,
            linear::solve_3d,
            dedaliano_engine::load_session::LoadSession3D,
            dedaliano_engine::certify::certify_linear_3d_full,
            constraints::solve_constrained_3d,
            corotational::solve_corotational_3d,
            material_nonlinear::solve_nonlinear_material_3d,
            cable::solve_cable_3d,
            contact::solve_contact_3d,
            ssi::solve_ssi_3d,
            winkler::solve_winkler_3d,
            pdelta::solve_pdelta_3d,
            crate::ana3::staged_3d,
            crate::ana3::stage_all
        )
    };
    let loads = condensed_loads(dim, model);
    fn attach_loads(result: &mut Value, loads: &Value) {
        if result.get("displacements").is_some() { result["condensedLoads"] = loads.clone(); }
        for key in ["results","linearResults"] {
            if let Some(child) = result.get_mut(key) { attach_loads(child, loads); }
        }
    }
    for reference in refs.as_object_mut().unwrap().values_mut() {
        if let Some(ok) = reference.get_mut("ok") { attach_loads(ok, &loads); }
    }
    refs
}

fn condensed_loads(dim: u64, model: &Value) -> Value {
    use dedaliano_engine::solver::{assembly, dof::DofNumbering};
    if dim == 2 {
        let model: SolverInput = serde_json::from_value(model.clone()).unwrap();
        let dof = DofNumbering::build_2d(&model);
        let f = assembly::assemble_load_vector_2d(&model, &model.loads, &dof, &[]);
        json!(model.nodes.values().map(|n| json!({"nodeId":n.id,"my":dof.global_dof(n.id,2).map_or(0.0,|d| f[d])})).collect::<Vec<_>>())
    } else {
        let model: SolverInput3D = serde_json::from_value(model.clone()).unwrap();
        let dof = DofNumbering::build_3d(&model);
        let f = assembly::assemble_load_vector_3d_dense(&model, &model.loads, &dof, &[]);
        json!(model.nodes.values().map(|n| json!({"nodeId":n.id,"mx":dof.global_dof(n.id,3).map_or(0.0,|d| f[d]),"my":dof.global_dof(n.id,4).map_or(0.0,|d| f[d]),"mz":dof.global_dof(n.id,5).map_or(0.0,|d| f[d])})).collect::<Vec<_>>())
    }
}

fn released_stage_all_2d(s: &SolverInput, loads: Vec<usize>) -> Value {
    json!({"name":"all","elementsAdded":s.elements.values().map(|e| e.id).collect::<Vec<_>>(),"supportsAdded":s.supports.values().map(|s| s.id).collect::<Vec<_>>(),"loadIndices":loads})
}

fn released_stage_2d(s: &SolverInput, stages: Value) -> Result<StagedAnalysisResults, String> {
    let mut v = serde_json::to_value(s).unwrap();
    v["stages"] = stages;
    dedaliano_engine::solver::staged::solve_staged_2d(
        &dedaliano_engine::solver::staged::parse_staged_2d(&v.to_string())?,
    )
}

fn orphan_translation_models() -> Vec<Value> {
    let mut cases = Vec::new();
    for dim in [2, 3] {
        for local in 0..dim {
            let mut model = if dim == 2 {
                serde_json::to_value(member_2d("Start")).unwrap()
            } else {
                serde_json::to_value(member("Mz", "Start", false)).unwrap()
            };
            model["nodes"]["3"] = if dim == 2 {
                json!({"id":3,"x":1.0,"z":1.0})
            } else {
                json!({"id":3,"x":1.0,"y":1.0,"z":1.0})
            };
            let mut load = if dim == 2 {
                json!({"type":"nodal","data":{"nodeId":3,"fx":0.0,"fz":0.0,"my":0.0}})
            } else {
                json!({"type":"nodal","data":{"nodeId":3,"fx":0.0,"fy":0.0,"fz":0.0,"mx":0.0,"my":0.0,"mz":0.0}})
            };
            load["data"][["fx", "fy", "fz"][if dim == 2 && local == 1 { 2 } else { local }]] =
                json!(1.0);
            model["loads"].as_array_mut().unwrap().push(load);
            cases.push(json!({"dim":dim,"local":local,"references":native_references(dim as u64,&model),"model":model}));
        }
    }
    cases
}

#[test]
fn released_nodes_do_not_hide_unsupported_translational_forces() {
    for c in orphan_translation_models() {
        for path in [
            "linear",
            "session",
            "certified",
            "constrained",
            "staged",
            "staged-two",
            "corotational",
            "material",
            "cable",
            "contact",
            "ssi",
            "winkler",
            "pdelta",
        ] {
            assert!(
                c["references"][path]["error"].is_string(),
                "{}/{}/{path}: {}",
                c["dim"],
                c["local"],
                c["references"][path]
            );
        }
    }
}

fn released_gauges(dim: u64, model: &Value) -> Value {
    if dim == 2 {
        let model: SolverInput = serde_json::from_value(model.clone()).unwrap();
        let dof = dedaliano_engine::solver::dof::DofNumbering::build_2d(&model);
        let stability = stability::of_2d(&model).unwrap();
        return json!(stability.free_rotations().map(|direction| {
            let value = direction.dofs.iter().zip(&direction.direction).find_map(|(d,v)| (dof.global_dof(direction.node,2) == Some(*d)).then_some(*v)).unwrap();
            json!({"node":direction.node,"rotation":[0.0,value,0.0]})
        }).collect::<Vec<_>>());
    }
    let model: SolverInput3D = serde_json::from_value(model.clone()).unwrap();
    let dof = dedaliano_engine::solver::dof::DofNumbering::build_3d(&model);
    let stability = stability::of_3d(&model).unwrap();
    let directions: Vec<_> = stability
        .free_rotations()
        .map(|direction| {
            let mut rotation = [0.0; 3];
            for (d, v) in direction.dofs.iter().zip(&direction.direction) {
                for local in 3..6 {
                    if dof.global_dof(direction.node, local) == Some(*d) {
                        rotation[local - 3] = *v;
                    }
                }
            }
            json!({"node":direction.node,"rotation":rotation})
        })
        .collect();
    json!(directions)
}

fn cancellation_models_2074() -> Vec<Value> {
    let mut cases = Vec::new();
    for dim in [2,3] {
        for end in ["Start","End"] {
            for residual in [-f64::EPSILON, 0.0, f64::EPSILON] {
                let mut model = if dim == 2 { serde_json::to_value(member_2d(end)).unwrap() } else { serde_json::to_value(member("Mz",end,false)).unwrap() };
                let node = if end == "Start" {1} else {2};
                if dim == 3 { model["loads"][0]["data"]["pz"] = json!(0.0); }
                let mut load = if dim == 2 {json!({"type":"nodal","data":{"nodeId":node,"fx":0.0,"fz":0.0,"my":1.0}})} else {json!({"type":"nodal","data":{"nodeId":node,"fx":0.0,"fy":0.0,"fz":0.0,"mx":0.0,"my":0.0,"mz":1.0}})};
                model["loads"].as_array_mut().unwrap().push(load.clone());
                load["data"][if dim == 2 {"my"} else {"mz"}] = json!(-1.0+residual);
                model["loads"].as_array_mut().unwrap().push(load);
                cases.push(json!({"dim":dim,"end":end,"residual":residual,"model":model}));
            }
        }
    }
    cases
}

#[test]
fn exact_nodal_cancellation_never_hides_a_genuine_released_moment() {
    let mut failures = Vec::new();
    for c in cancellation_models_2074() {
        let dim = c["dim"].as_u64().unwrap();
        let refs = native_references(dim,&c["model"]);
        if c["residual"].as_f64().unwrap() != 0.0 {
            for name in entry_names().into_iter().chain(["linear (WASM typed path)","linear (dense reference)"]) {
                if dim == 2 {
                    if name == "plastic collapse" { continue; }
                    let adapter = crate::ana2::rows().into_iter().find(|a| a.name == name).unwrap();
                    let model = serde_json::from_value(c["model"].clone()).unwrap();
                    assert!((adapter.run)(&crate::case::Case2::new("exact residual",model)).is_err(),"2/{name}/{}",c["residual"]);
                } else {
                    if ["linear (WASM typed path)","linear (dense reference)"].contains(&name) { continue; }
                    let adapter = crate::ana3::rows().into_iter().find(|a| a.name == name).unwrap();
                    let model = serde_json::from_value(c["model"].clone()).unwrap();
                    assert!((adapter.run)(&crate::case::Case3::new("exact residual",model)).is_err(),"3/{name}/{}",c["residual"]);
                }
            }
        }
        for (path, reference) in refs.as_object().unwrap() {
            let refused = c["residual"].as_f64().unwrap() != 0.0;
            if reference["error"].is_string() != refused {
                failures.push(format!("{}/{}/{}/{path}: {reference}", c["dim"],c["end"],c["residual"]));
            }
            if !refused && reference["ok"].is_object() {
                assert_ne!(reference["ok"]["converged"],json!(false),"{path}: {reference}");
            }
            if refused && reference["error"].is_string() {
                let error = reference["error"].as_str().unwrap();
                assert!(error.contains("moment") || error.contains("rotation") || error.contains("Singular"), "{path}: {error}");
            }
        }
    }
    assert!(failures.is_empty(),"{}", failures.join("\n"));
}

fn assembly_models_2074() -> Vec<Value> {
    let mut cases = Vec::new();
    for dim in [2,3] {
        for end in ["Start","End"] {
            let node = if end == "Start" {1} else {2};
            let mut model = if dim == 2 {serde_json::to_value(member_2d(end)).unwrap()} else {serde_json::to_value(member("Mz",end,false)).unwrap()};
            let support = &mut model["supports"][node.to_string()];
            if dim == 2 {
                support["type"] = json!("inclinedRoller");
                support["angle"] = json!(0.3);
            } else {
                support["isInclined"] = json!(true);
                support["normalX"] = json!(0.3);
                support["normalY"] = json!(0.7);
                support["normalZ"] = json!(1.1);
            }
            let direction = if dim == 2 { [0.0;3] } else {
                let s: SolverInput3D = serde_json::from_value(model.clone()).unwrap();
                let (a,b,e) = (&s.nodes["1"],&s.nodes["2"],&s.elements["1"]);
                dedaliano_engine::element::compute_local_axes_3d(a.x,a.y,a.z,b.x,b.y,b.z,e.local_yx,e.local_yy,e.local_yz,e.roll_angle,false).2
            };
            let references = native_references(dim,&model);
            let gauges = released_gauges(dim,&model);
            cases.push(json!({"dim":dim,"end":end,"model":model,"node":node,"direction":direction,"references":references,"gauges":gauges}));
        }
    }
    cases
}

#[test]
fn inclined_supports_keep_single_fef_zero_work_and_refuse_real_moments() {
    for c in assembly_models_2074() {
        let dim = c["dim"].as_u64().unwrap();
        for (path,reference) in c["references"].as_object().unwrap() {
            if ["staged","staged-two"].contains(&path.as_str()) {
                assert_eq!(reference["error"],json!("Inclined supports are not yet supported in staged construction analysis (reactions would be reported in the rotated support frame)"));
                continue;
            }
            let numerical = dim == 3 && ["corotational","material","ssi"].contains(&path.as_str());
            if reference["error"].is_string() {
                assert!(numerical && reference["error"].as_str().unwrap().starts_with("Singular"),"{dim}/{path}: {reference}");
            } else if !numerical {
                assert_ne!(reference["ok"]["converged"],json!(false),"{dim}/{path}");
            }
        }
        for magnitude in [-1.0, -f64::EPSILON.sqrt(), f64::EPSILON.sqrt(), 1.0] {
            let mut model = c["model"].clone();
            let load = if dim == 2 {json!({"type":"nodal","data":{"nodeId":c["node"],"fx":0.0,"fz":0.0,"my":magnitude}})} else {json!({"type":"nodal","data":{"nodeId":c["node"],"fx":0.0,"fy":0.0,"fz":0.0,"mx":magnitude*c["direction"][0].as_f64().unwrap(),"my":magnitude*c["direction"][1].as_f64().unwrap(),"mz":magnitude*c["direction"][2].as_f64().unwrap()}})};
            model["loads"].as_array_mut().unwrap().push(load);
            for (path,reference) in native_references(dim,&model).as_object().unwrap() {
                if ["staged","staged-two"].contains(&path.as_str()) {
                    assert_eq!(reference["error"],c["references"][path]["error"]);
                    continue;
                }
                assert!(reference["error"].is_string(),"{dim}/{path}/{magnitude}: {reference}");
                let error = reference["error"].as_str().unwrap();
                assert!(error.contains("moment") || error.contains("rotation"),"{dim}/{path}/{magnitude}: {error}");
            }
        }
    }
}

fn assert_static_adapters_complete(dim: u64, model: &Value) {
    for name in entry_names().into_iter().chain(["linear (WASM typed path)","linear (dense reference)"]) {
        if name == "plastic collapse" || (dim == 3 && ["linear (WASM typed path)","linear (dense reference)"].contains(&name)) { continue; }
        if name == "corotational" && model["loads"].as_array().unwrap().iter().any(|load| load["type"] == json!("thermal")) {
            assert_eq!(native_references(dim,model)["corotational"]["error"],json!("Corotational analysis does not support thermal loads (member 1); it would solve the model without them. Remove them or use an analysis that supports them."));
            continue;
        }
        if name == "staged (loads in two stages)" {
            let reference = native_references(dim,model);
            assert!(reference["staged-two"]["ok"].is_object(),"{dim}/{name}: {}",reference["staged-two"]);
            continue;
        }
        if name == "load combinations" {
            use dedaliano_engine::solver::load_cases::*;
            let combinations = vec![CombinationDef {name:"C".into(),factors:[("A".into(),1.0)].into()}];
            if dim == 2 {
                let mut solver: SolverInput = serde_json::from_value(model.clone()).unwrap();
                let loads = std::mem::take(&mut solver.loads);
                let result = solve_multi_case_2d(&MultiCaseInput {solver,load_cases:vec![LoadCase {name:"A".into(),loads}],combinations}).unwrap();
                assert!(!result.combination_results[0].results.element_forces.is_empty());
            } else {
                let mut solver: SolverInput3D = serde_json::from_value(model.clone()).unwrap();
                let loads = std::mem::take(&mut solver.loads);
                let result = solve_multi_case_3d(&MultiCaseInput3D {solver,load_cases:vec![LoadCase3D {name:"A".into(),loads}],combinations}).unwrap();
                assert!(!result.combination_results[0].results.element_forces.is_empty());
            }
            continue;
        }
        if dim == 2 {
            let adapter = crate::ana2::rows().into_iter().find(|a| a.name == name).unwrap();
            let result = (adapter.run)(&crate::case::Case2::new("loaded zero work",serde_json::from_value(model.clone()).unwrap()));
            assert!(!result.unwrap_or_else(|e| panic!("{dim}/{name}: {e}")).0.is_empty(),"{dim}/{name}");
        } else {
            let adapter = crate::ana3::rows().into_iter().find(|a| a.name == name).unwrap();
            let result = (adapter.run)(&crate::case::Case3::new("loaded zero work",serde_json::from_value(model.clone()).unwrap()));
            assert!(!result.unwrap_or_else(|e| panic!("{dim}/{name}: {e}")).0.is_empty(),"{dim}/{name}");
        }
    }
}

#[test]
fn zero_residual_controls_keep_the_cancelling_loads() {
    for c in cancellation_models_2074() {
        if c["residual"].as_f64().unwrap() == 0.0 {
            assert_eq!(c["model"]["loads"].as_array().unwrap().len(),3);
            assert_static_adapters_complete(c["dim"].as_u64().unwrap(),&c["model"]);
            for (path,reference) in native_references(c["dim"].as_u64().unwrap(),&c["model"]).as_object().unwrap() {
                assert!(reference["ok"].is_object(),"{path}: {reference}");
                assert_ne!(reference["ok"]["converged"],json!(false),"{path}: {reference}");
            }
            let mut roundoff = c["model"].clone();
            let load = roundoff["loads"][1].clone();
            let key = if c["dim"] == json!(2) {"my"} else {"mz"};
            roundoff["loads"].as_array_mut().unwrap().truncate(1);
            for magnitude in [1e20,1.0,-1e20,-1.0] {
                let mut term = load.clone();
                term["data"][key] = json!(magnitude);
                roundoff["loads"].as_array_mut().unwrap().push(term);
            }
            for (path,reference) in native_references(c["dim"].as_u64().unwrap(),&roundoff).as_object().unwrap() {
                assert!(reference["ok"].is_object(),"rounded cancellation/{path}: {reference}");
                assert_ne!(reference["ok"]["converged"],json!(false),"{path}: {reference}");
                let result = reference["ok"].get("results").unwrap_or(&reference["ok"]);
                let gauges = released_gauges(c["dim"].as_u64().unwrap(), &roundoff);
                for gauge in gauges.as_array().unwrap() {
                    let load = result["condensedLoads"].as_array().unwrap().iter().find(|load| load["nodeId"] == gauge["node"]).unwrap();
                    let work: f64 = ["mx","my","mz"].iter().enumerate().map(|(i,key)| load.get(key).and_then(Value::as_f64).unwrap_or(0.0)*gauge["rotation"][i].as_f64().unwrap()).sum();
                    assert_eq!(work,0.0,"rounded cancellation/{path}/released load");
                }
                for element in roundoff["elements"].as_object().unwrap().values() {
                    let force = result["elementForces"].as_array().unwrap().iter().find(|force| force["elementId"] == element["id"]).unwrap();
                    for end in ["Start","End"] {
                        for (release,moment) in [(format!("hinge{end}"),format!("m{end}")),(format!("releaseMy{end}"),format!("my{end}")),(format!("releaseMz{end}"),format!("mz{end}")),(format!("releaseT{end}"),format!("mx{end}"))] {
                            if element[&release] == json!(true) { assert_eq!(force[&moment],json!(0.0),"rounded cancellation/{path}/{moment}"); }
                        }
                    }
                }
            }
            for residual in [-f64::EPSILON,f64::EPSILON] {
                let mut bad = roundoff.clone();
                bad["loads"][4]["data"][key] = json!(-1.0+residual);
                for (path,reference) in native_references(c["dim"].as_u64().unwrap(),&bad).as_object().unwrap() {
                    assert!(reference["error"].is_string(),"rounded residual/{residual}/{path}: {reference}");
                }
            }

        }
    }
}

fn truss_models_2074() -> Vec<Value> {
    let mut cases = Vec::new();
    for dim in [2,3] {
        for kind in ["distributed","point","axial","thermal"] {
            let point = kind == "point";
            let mut model = if dim == 2 {serde_json::to_value(member_2d("Start")).unwrap()} else {serde_json::to_value(member("Mz","Start",true)).unwrap()};
            model["elements"]["1"]["type"] = json!("truss");
            if dim == 2 {
                model["supports"]["2"]["type"] = json!("rollerX");
                if !point { model["loads"] = json!([{"type":"distributed","data":{"elementId":1,"qI":0.3,"qJ":0.7}}]); }
            } else {
                for key in ["rx","rrx","rry","rrz"] { model["supports"]["2"][key] = json!(false); }
                model["loads"] = if point {json!([{"type":"pointOnElement","data":{"elementId":1,"a":0.7,"px":0.3,"py":0.7,"pz":1.1}}])} else {json!([{"type":"distributed","data":{"elementId":1,"qXI":0.0,"qXJ":0.0,"qYI":0.3,"qYJ":0.7,"qZI":1.1,"qZJ":-0.3}}])};
            }
            if kind == "axial" {
                model["loads"] = if dim == 2 { json!([{"type":"axialDistributed","data":{"elementId":1,"qI":0.3,"qJ":0.7}}]) }
                else { json!([{"type":"distributed","data":{"elementId":1,"qXI":0.3,"qXJ":0.7,"qYI":0.0,"qYJ":0.0,"qZI":0.0,"qZJ":0.0}}]) };
            } else if kind == "thermal" {
                model["loads"] = if dim == 2 { json!([{"type":"thermal","data":{"elementId":1,"dtUniform":0.7,"dtGradient":0.0,"alpha":0.00001}}]) }
                else { json!([{"type":"thermal","data":{"elementId":1,"dtUniform":0.7,"dtGradientY":0.0,"dtGradientZ":0.0,"alpha":0.00001}}]) };
                model["loads"].as_array_mut().unwrap().push(if dim == 2 {
                    json!({"type":"nodal","data":{"nodeId":2,"fx":0.3,"fz":0.0,"my":0.0}})
                } else {
                    json!({"type":"nodal","data":{"nodeId":2,"fx":0.3,"fy":0.0,"fz":0.0,"mx":0.0,"my":0.0,"mz":0.0}})
                });
            }
            let harmonic = json!({"solver":model,"densities":{"1":1.0},"frequencies":[0.0,1.0],"dampingRatio":0.05,"responseNodeId":2,"responseDof":"x"});
            let harmonic_reference = if dim == 2 {
                serde_json::to_value(dedaliano_engine::solver::harmonic::solve_harmonic_2d(&serde_json::from_value(harmonic.clone()).unwrap()).unwrap()).unwrap()
            } else {
                serde_json::to_value(dedaliano_engine::solver::harmonic::solve_harmonic_3d(&serde_json::from_value(harmonic.clone()).unwrap()).unwrap()).unwrap()
            };
            assert!(harmonic_reference["peakAmplitude"].as_f64().unwrap() > 0.0);
            let references = native_references(dim,&model);
            let gauges = released_gauges(dim,&model);
            cases.push(json!({"dim":dim,"point":point,"kind":kind,"model":model,"references":references,"gauges":gauges,"harmonic":harmonic,"harmonicReference":harmonic_reference}));
        }
    }
    cases
}

#[test]
fn oblique_truss_loads_solve_and_genuine_moments_refuse_across_static_entries() {
    for c in truss_models_2074() {
        let dim = c["dim"].as_u64().unwrap();
        assert_static_adapters_complete(dim,&c["model"]);
        for (path,reference) in c["references"].as_object().unwrap() {
            if c["kind"] == json!("thermal") && path == "corotational" {
                assert_eq!(reference["error"],json!("Corotational analysis does not support thermal loads (member 1); it would solve the model without them. Remove them or use an analysis that supports them."));
                continue;
            }
            assert!(reference["ok"].is_object(),"{dim}/{}/{path}: {reference}",c["point"]);
            assert_ne!(reference["ok"]["converged"],json!(false),"{dim}/{path}: {reference}");
        }
        for node in [1,2] {
            for magnitude in [-1.0,-f64::EPSILON,f64::EPSILON,1.0] {
                let mut bad = c["model"].clone();
                let moment = if dim == 2 {json!({"my":magnitude})} else {json!({"mx":magnitude,"my":0.0,"mz":0.0,"fy":0.0})};
                let mut data = json!({"nodeId":node,"fx":0.0,"fz":0.0});
                data.as_object_mut().unwrap().extend(moment.as_object().unwrap().clone());
                bad["loads"].as_array_mut().unwrap().push(json!({"type":"nodal","data":data}));
                for (path,reference) in native_references(dim,&bad).as_object().unwrap() {
                    assert!(reference["error"].is_string(),"{dim}/{node}/{magnitude}/{path}: {reference}");
                }
                let mut harmonic = c["harmonic"].clone();
                harmonic["solver"] = bad;
                if dim == 2 {
                    assert!(dedaliano_engine::solver::harmonic::solve_harmonic_2d(&serde_json::from_value(harmonic).unwrap()).is_err());
                } else {
                    assert!(dedaliano_engine::solver::harmonic::solve_harmonic_3d(&serde_json::from_value(harmonic).unwrap()).is_err());
                }
            }
        }
    }
}

#[test]
fn released_gauges_require_absent_rotational_stiffness() {
    for end in ["Start", "End"] {
        let node = if end == "Start" {"1"} else {"2"};
        for dim in [2,3] {
            let mut model = if dim == 2 {serde_json::to_value(member_2d(end)).unwrap()} else {serde_json::to_value(member("Mz",end,true)).unwrap()};
            assert_eq!(released_gauges(dim,&model).as_array().unwrap().len(),1);
            for stiffness in [0.0,1.0] {
                if dim == 2 { model["supports"][node]["kz"] = json!(stiffness); }
                else { for key in ["krx","kry","krz"] { model["supports"][node][key] = json!(stiffness); } }
                assert_eq!(released_gauges(dim,&model).as_array().unwrap().len(),if stiffness == 0.0 {1} else {0},"{dim}/{end}/{stiffness}");
            }
        }
    }
}

fn mixed_orphan_model_2074(dim: u64, axis: &str, terms: &[f64]) -> Value {
    let mut model = if dim == 2 { serde_json::to_value(member_2d("Start")).unwrap() } else { serde_json::to_value(member("Mz", "Start", false)).unwrap() };
    model["nodes"] = if dim == 2 { json!({"1":{"id":1,"x":0.0,"z":0.0},"2":{"id":2,"x":3.0,"z":0.0},"3":{"id":3,"x":6.0,"z":0.0}}) } else { json!({"1":{"id":1,"x":0.0,"y":0.0,"z":0.0},"2":{"id":2,"x":3.0,"y":0.0,"z":0.0},"3":{"id":3,"x":6.0,"y":0.0,"z":0.0}}) };
    let mut frame = model["elements"]["1"].clone();
    for key in ["hingeStart","hingeEnd","releaseMyStart","releaseMyEnd","releaseMzStart","releaseMzEnd","releaseTStart","releaseTEnd"] { if let Some(value) = frame.get_mut(key) { *value = json!(false); } }
    let mut truss = frame.clone();
    truss["id"] = json!(2);
    truss["type"] = json!("truss");
    truss["nodeI"] = json!(2);
    truss["nodeJ"] = json!(3);
    model["elements"] = json!({"1":frame,"2":truss});
    model["supports"] = if dim == 2 { json!({"1":{"id":1,"nodeId":1,"type":"fixed"},"3":{"id":3,"nodeId":3,"type":"rollerX"}}) } else { json!({"1":{"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true},"3":{"nodeId":3,"rx":false,"ry":true,"rz":true,"rrx":false,"rry":false,"rrz":false}}) };
    let data = if dim == 2 { json!({"nodeId":3,"fx":1.0,"fz":0.0,"my":0.0}) } else { json!({"nodeId":3,"fx":1.0,"fy":0.0,"fz":0.0,"mx":0.0,"my":0.0,"mz":0.0}) };
    model["loads"] = json!([{"type":"nodal","data":data}]);
    for term in terms {
        let mut data = data.clone();
        data["fx"] = json!(0.0);
        data[axis] = json!(term);
        model["loads"].as_array_mut().unwrap().push(json!({"type":"nodal","data":data}));
    }
    model
}

fn check_mixed_orphan_cancellation_2074(dim: u64) {
    let mut failures = Vec::new();
    for axis in if dim == 2 { vec!["my"] } else { vec!["mx","my","mz"] } {
        let baseline = native_references(dim, &mixed_orphan_model_2074(dim,axis,&[]));
        for terms in [vec![1.0,-1.0],vec![1e20,1.0,-1e20,-1.0]] {
            let model = mixed_orphan_model_2074(dim,axis,&terms);
            for (path,reference) in native_references(dim,&model).as_object().unwrap() {
                if dim == 3 && path == "corotational" {
                    assert_eq!(baseline[path]["error"],json!("Singular tangent stiffness — structure may be a mechanism or load increment too large"));
                    assert_eq!(reference["error"],baseline[path]["error"]);
                    continue;
                }
                assert!(baseline[path]["ok"].is_object(),"{dim}/{axis}/{path}: missing control answer");
                assert_ne!(baseline[path]["ok"]["converged"],json!(false));
                assert_ne!(reference["ok"]["converged"],json!(false));
                if physical_static_2074(&reference["ok"]) != physical_static_2074(&baseline[path]["ok"]) || !reference["ok"].is_object() {
                    failures.push(format!("{dim}/{axis}/{terms:?}/{path}: {}",reference.get("error").unwrap_or(&json!("physical response differs"))));
                }
            }
        }
        for residual in [-1.0,-f64::EPSILON,f64::EPSILON,1.0] {
            let model = mixed_orphan_model_2074(dim,axis,&[1.0,-1.0,residual]);
            for (path,reference) in native_references(dim,&model).as_object().unwrap() {
                assert!(reference["error"].is_string(),"{dim}/{axis}/{residual}/{path}: {reference}");
            }
        }
    }
    assert!(failures.is_empty(),"{}",failures.join("\n"));
}

#[test]
fn mixed_orphan_moment_cancellation_2d() {
    check_mixed_orphan_cancellation_2074(2);
}

#[test]
fn mixed_orphan_moment_cancellation_3d() {
    check_mixed_orphan_cancellation_2074(3);
}

fn physical_static_2074(result: &Value) -> Value {
    let result = result.get("results").unwrap_or(result);
    let mut physical = json!({});
    for (collection,id) in [("displacements","nodeId"),("reactions","nodeId"),("elementForces","elementId")] {
        if let Some(rows) = result[collection].as_array() {
            let mut rows = rows.clone();
            rows.sort_by_key(|row| row[id].as_u64());
            physical[collection] = json!(rows);
        }
    }
    physical
}

fn mixed_dynamic_inputs_2074(terms: &[f64]) -> (Value,Value) {
    let model = mixed_orphan_model_2074(3,"mz",terms);
    let loads = model["loads"].as_array().unwrap().iter().map(|load| load["data"].clone()).collect::<Vec<_>>();
    let harmonic = json!({"solver":model,"densities":{"1":1.0},"frequencies":[0.0,1.0],"dampingRatio":0.05,"responseNodeId":3,"responseDof":"x"});
    let history = json!({"solver":model,"densities":{"1":1.0},"timeStep":0.01,"nSteps":2,"method":"newmark","beta":0.25,"gamma":0.5,"dampingXi":0.05,"forceHistory":[{"time":0.0,"loads":loads},{"time":1.0,"loads":loads}]});
    (harmonic,history)
}

#[test]
fn mixed_orphan_dynamic_moments_cancel_within_each_record_only() {
    use dedaliano_engine::solver::{harmonic,time_integration};
    let (h,t) = mixed_dynamic_inputs_2074(&[]);
    let baseline_h = serde_json::to_value(harmonic::solve_harmonic_3d(&serde_json::from_value(h).unwrap()).unwrap()).unwrap();
    let baseline_t = serde_json::to_value(time_integration::solve_time_history_3d(&serde_json::from_value(t).unwrap()).unwrap()).unwrap();
    assert!(baseline_h["peakAmplitude"].as_f64().unwrap() > 0.0);
    assert!(baseline_t["nodeHistories"].as_array().unwrap().iter().any(|n| n["ux"].as_array().unwrap().iter().any(|x| x.as_f64().unwrap() != 0.0)));
    for terms in [vec![1.0,-1.0],vec![1e20,1.0,-1e20,-1.0]] {
        let (h,t) = mixed_dynamic_inputs_2074(&terms);
        let result_h = serde_json::to_value(harmonic::solve_harmonic_3d(&serde_json::from_value(h).unwrap()).unwrap()).unwrap();
        let result_t = serde_json::to_value(time_integration::solve_time_history_3d(&serde_json::from_value(t).unwrap()).unwrap()).unwrap();
        assert!(result_h["responsePoints"].is_array());
        assert_eq!(result_h["responsePoints"],baseline_h["responsePoints"]);
        assert_eq!(result_t["nodeHistories"],baseline_t["nodeHistories"]);
        assert!(result_t["nodeHistories"].is_array());
    }
    for residual in [-1.0,-f64::EPSILON,f64::EPSILON,1.0] {
        let (h,t) = mixed_dynamic_inputs_2074(&[1.0,-1.0,residual]);
        assert!(harmonic::solve_harmonic_3d(&serde_json::from_value(h).unwrap()).is_err());
        assert!(time_integration::solve_time_history_3d(&serde_json::from_value(t).unwrap()).is_err());
    }
    let (_,mut t) = mixed_dynamic_inputs_2074(&[]);
    t["forceHistory"][0]["loads"].as_array_mut().unwrap().push(json!({"nodeId":3,"fx":0.0,"fy":0.0,"fz":0.0,"mx":0.0,"my":0.0,"mz":1.0}));
    t["forceHistory"][1]["loads"].as_array_mut().unwrap().push(json!({"nodeId":3,"fx":0.0,"fy":0.0,"fz":0.0,"mx":0.0,"my":0.0,"mz":-1.0}));
    assert!(time_integration::solve_time_history_3d(&serde_json::from_value(t).unwrap()).is_err());
}

fn mixed_orphan_cases_2074() -> Vec<Value> {
    let mut cases = Vec::new();
    for dim in [2,3] {
        for axis in if dim == 2 { vec!["my"] } else { vec!["mx","my","mz"] } {
            let baseline = native_references(dim,&mixed_orphan_model_2074(dim,axis,&[]));
            for terms in [vec![],vec![1.0,-1.0],vec![1e20,1.0,-1e20,-1.0],vec![1.0,-1.0,-1.0],vec![1.0,-1.0,-f64::EPSILON],vec![1.0,-1.0,f64::EPSILON],vec![1.0,-1.0,1.0]] {
                let model = mixed_orphan_model_2074(dim,axis,&terms);
                let refuses = terms.len() == 3;
                cases.push(json!({"dim":dim,"axis":axis,"terms":terms,"model":model,"references":baseline,"refuses":refuses}));
            }
        }
    }
    cases
}

fn mixed_dynamic_cases_2074() -> Vec<Value> {
    use dedaliano_engine::solver::{harmonic,time_integration};
    let (h,t) = mixed_dynamic_inputs_2074(&[]);
    let reference_h = harmonic::solve_harmonic_3d(&serde_json::from_value(h).unwrap()).unwrap();
    let reference_t = time_integration::solve_time_history_3d(&serde_json::from_value(t).unwrap()).unwrap();
    let mut cases = Vec::new();
    for terms in [vec![],vec![1.0,-1.0],vec![1e20,1.0,-1e20,-1.0],vec![1.0,-1.0,-f64::EPSILON],vec![1.0,-1.0,f64::EPSILON]] {
        let (h,t) = mixed_dynamic_inputs_2074(&terms);
        cases.push(json!({"harmonic":h,"history":t,"referenceHarmonic":reference_h,"referenceHistory":reference_t,"refuses":terms.len()==3}));
    }
    let (_,mut history) = mixed_dynamic_inputs_2074(&[]);
    for (i,mz) in [(0,1.0),(1,-1.0)] {
        history["forceHistory"][i]["loads"].as_array_mut().unwrap().push(json!({"nodeId":3,"fx":0.0,"fy":0.0,"fz":0.0,"mx":0.0,"my":0.0,"mz":mz}));
    }
    cases.push(json!({"history":history,"refuses":true}));
    cases
}

fn near_parallel_models_2074() -> Vec<Value> {
    let mut cases = Vec::new();
    for end in ["Start","End"] {
        for angle in [0.0,1e-16,1e-13,1e-8] {
            let mut model = release_pair("My","Mz",end,true);
            let mut second = model.elements["1"].clone();
            second.id = 2;
            second.roll_angle = Some(angle);
            model.elements.insert("2".into(),second);
            let (a,b) = (&model.nodes["1"],&model.nodes["2"]);
            let (_,ey,ez) = dedaliano_engine::element::compute_local_axes_3d(a.x,a.y,a.z,b.x,b.y,b.z,None,None,None,None,false);
            let node = if end=="Start" {1} else {2};
            let direction: Vec<_> = (0..3).map(|i|0.8*ey[i]+0.6*ez[i]).collect();
            let mut extra_model = model.clone();
            let (a,b) = (&model.nodes["1"],&model.nodes["2"]);
            let (ex,_,_) = dedaliano_engine::element::compute_local_axes_3d(a.x,a.y,a.z,b.x,b.y,b.z,None,None,None,None,false);
            extra_model.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {node_id:node,fx:0.0,fy:0.0,fz:0.0,mx:ex[0],my:ex[1],mz:ex[2],bw:None}));
            let fy = crate::case::Case3::new("near parallel plastic",model.clone()).p.fy;
            let sections: serde_json::Map<String,Value> = model.sections.iter().map(|(id,section)| {
                let (b,h) = crate::ana3::rect3(section);
                let material = model.elements.values().find(|e|e.section_id==section.id).unwrap().material_id;
                (id.clone(),json!({"a":section.a,"iy":section.iy,"iz":section.iz,"materialId":material,"b":b,"h":h,"d":b}))
            }).collect();
            let materials: serde_json::Map<String,Value> = model.materials.keys().map(|id|(id.clone(),json!({"fy":fy}))).collect();
            let mut multi = extra_model.clone();
            multi.loads.clear();
            let extra = json!({
                "creep":{"solver":extra_model,"creepParams":{},"timeSteps":[{"tDays":28.0,"additionalLoads":[]}],"agingCoefficient":0.8},
                "plastic":{"solver":extra_model,"sections":sections,"materials":materials},
                "multi":{"solver":multi,"loadCases":[{"name":"A","loads":extra_model.loads}],"combinations":[{"name":"C","factors":{"A":1.0}}]}
            });
            cases.push(json!({"dim":3,"end":end,"angle":angle,"model":model,"node":node,"direction":direction,"extraInputs":extra}));
        }
    }
    cases
}

#[test]
fn near_parallel_release_candidates_admit_zero_work_and_refuse_moments() {
    let mut failures = Vec::new();
    for c in near_parallel_models_2074() {
        let model: SolverInput3D = serde_json::from_value(c["model"].clone()).unwrap();
        for name in entry_names() {
            let adapter = crate::ana3::rows().into_iter().find(|a|a.name==name).unwrap();
            for factor in [0.0,-f64::EPSILON,-f64::EPSILON.sqrt(),f64::EPSILON,f64::EPSILON.sqrt()] {
                let mut input = model.clone();
                let direction: Vec<f64> = serde_json::from_value(c["direction"].clone()).unwrap();
                input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {node_id:c["node"].as_u64().unwrap() as usize,fx:0.0,fy:0.0,fz:0.0,mx:factor*direction[0],my:factor*direction[1],mz:factor*direction[2],bw:None}));
                if name=="linear" {
                    let initial = dedaliano_engine::solver::pdelta::solve_pdelta_3d(&input,0,1e-12);
                    if factor==0.0 {
                        let initial = initial.unwrap();
                        assert!(!initial.converged);
                        assert_eq!(initial.linear_results.displacements.len(),input.nodes.len());
                    } else {assert!(initial.is_err());}
                }
                let result = (adapter.run)(&crate::case::Case3::new("near parallel releases",input));
                let accepted = if factor==0.0 {
                    result.is_ok() || (name=="SSI (no soil springs)" && result.as_ref().err().is_some_and(|e|e=="Singular stiffness in SSI iteration"))
                } else {
                    result.as_ref().err().is_some_and(|e|e.contains("Nodal moment") || e.contains("free rotation would carry load") || e.contains("loaded released rotation"))
                };
                if !accepted {failures.push(format!("{name}/{}/{}/{factor}: {result:?}",c["end"],c["angle"]));}
            }
        }
    }
    assert!(failures.is_empty(),"{}",failures.join("\n"));
}

fn near_parallel_extra_references(inputs: &Value) -> Value {
    let creep = dedaliano_engine::solver::creep_shrinkage::solve_creep_shrinkage_3d(&serde_json::from_value(inputs["creep"].clone()).unwrap()).unwrap();
    let plastic = dedaliano_engine::solver::plastic::solve_plastic_3d(&serde_json::from_value(inputs["plastic"].clone()).unwrap()).unwrap();
    let multi = dedaliano_engine::solver::load_cases::solve_multi_case_3d(&serde_json::from_value(inputs["multi"].clone()).unwrap()).unwrap();
    json!({"creep":creep,"plastic":plastic,"multi":multi})
}
