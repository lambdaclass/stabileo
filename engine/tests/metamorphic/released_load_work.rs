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
        std::fs::write(path, serde_json::to_vec(&json!({"cases":cases,"exact":exact,"orphanTranslations":orphan_translation_models()})).unwrap()).unwrap();
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
    if dim == 2 {
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
        return json!([]);
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
