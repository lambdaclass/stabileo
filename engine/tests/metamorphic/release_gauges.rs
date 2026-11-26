use dedaliano_engine::{
    metamorphic::reversal::reverse_3d,
    solver::{linear::SPARSE_THRESHOLD, material_nonlinear::solve_nonlinear_material_3d},
    types::{NonlinearMaterialInput3D, SolverInput3D},
};

fn archived_1090() -> SolverInput3D {
    let model = crate::corpus::parse(include_str!(
        "../metamorphic_corpus/stability/issue-1090.json"
    ));
    let crate::corpus::Model::D3(input) = model.unwrap() else {
        panic!("expected a spatial model")
    };
    input
}

fn material_input(solver: SolverInput3D) -> NonlinearMaterialInput3D {
    NonlinearMaterialInput3D {
        solver,
        material_models: Default::default(),
        section_capacities: Default::default(),
        max_iter: 60,
        tolerance: 1e-10,
        n_increments: 4,
    }
}

fn separate_cantilevers(source: &SolverInput3D, count: usize) -> SolverInput3D {
    let mut model = source.clone();
    for i in 1..count {
        let first = 2 * i + 1;
        let second = first + 1;
        for (original, id) in [("1", first), ("2", second)] {
            let mut node = source.nodes[original].clone();
            node.id = id;
            node.x += i as f64 * (source.nodes["2"].x - source.nodes["1"].x).abs();
            model.nodes.insert(id.to_string(), node);
        }
        let mut element = source.elements["1"].clone();
        element.id = i + 1;
        element.node_i += 2 * i;
        element.node_j += 2 * i;
        model.elements.insert(element.id.to_string(), element);
        let mut support = source.supports["1"].clone();
        support.node_id = first;
        model.supports.insert(first.to_string(), support);
    }
    model
}

#[test]
fn issue_1090_material_tangent_preserves_the_released_tip() {
    use dedaliano_engine::solver::dof::DofNumbering;
    let source = archived_1090();
    let reversed = reverse_3d(&source, &|_| true).unwrap();
    let dense_count = DofNumbering::build_3d(&source).n_free;
    let sparse = separate_cantilevers(&reversed, SPARSE_THRESHOLD.div_ceil(dense_count));
    assert!(dense_count < SPARSE_THRESHOLD);
    assert!(DofNumbering::build_3d(&sparse).n_free >= SPARSE_THRESHOLD);

    let mut constrained = reversed.clone();
    constrained
        .constraints
        .push(dedaliano_engine::types::Constraint::LinearMPC(
            dedaliano_engine::types::LinearMPCConstraint {
                terms: vec![dedaliano_engine::types::MPCTerm {
                    node_id: 2,
                    dof: 0,
                    coefficient: 1.0,
                }],
            },
        ));
    let mut unhinged = reversed.clone();
    unhinged.elements.get_mut("1").unwrap().release_my_start = false;
    let mut cases = Vec::new();
    let mut failures = Vec::new();
    for (label, model) in [
        ("original", source),
        ("reversed", reversed),
        ("reversed sparse", sparse),
        ("reversed with translation constraint", constrained),
        ("unhinged", unhinged),
    ] {
        let expected = model.supports["1"].dz.unwrap();
        let input = material_input(model);
        assert_ne!(expected, 0.0);
        match solve_nonlinear_material_3d(&input) {
            Ok(result) if result.converged => {
                let actual = result
                    .results
                    .displacements
                    .iter()
                    .find(|d| d.node_id == 2)
                    .unwrap()
                    .uz;
                let relative_error = ((actual - expected) / expected).abs();
                assert!(
                    relative_error <= crate::common::tolerance::parity::REL_TOL_DISP,
                    "{label}: {actual} vs {expected}"
                );
            }
            other => failures.push(format!("{label}: {other:?}")),
        }
        cases.push(serde_json::json!({
            "label": label, "input": input, "expected": expected,
            "relTol": crate::common::tolerance::parity::REL_TOL_DISP
        }));
    }
    if let Some(path) = std::env::var_os("MATERIAL_RELEASE_WASM_CASES") {
        std::fs::write(path, serde_json::to_vec(&cases).unwrap()).unwrap();
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn issue_1635_modal_reversal_recovers_the_massless_released_tip() {
    use dedaliano_engine::{
        certify::modal::certify_modal_3d,
        solver::modal::solve_modal_3d,
        types::{Constraint, LinearMPCConstraint, MPCTerm, NodalMass3D},
    };
    let model = crate::corpus::parse(include_str!(
        "../metamorphic_corpus/stability/issue-1635.json"
    ));
    let crate::corpus::Model::D3(input) = model.unwrap() else {
        panic!("expected a spatial model")
    };
    let case = crate::case::Case3::new("replay", input);
    let reversed = reverse_3d(&case.s, &|_| true).unwrap();
    let e = &case.s.elements["1"];
    let a = &case.s.nodes[&e.node_i.to_string()];
    let b = &case.s.nodes[&e.node_j.to_string()];
    let (_, _, released_axis) = dedaliano_engine::element::compute_local_axes_3d(
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
    let axis = (0..3)
        .max_by(|&i, &j| released_axis[i].abs().total_cmp(&released_axis[j].abs()))
        .unwrap();
    let mut reference = case.s.clone();
    reference
        .constraints
        .push(Constraint::LinearMPC(LinearMPCConstraint {
            terms: vec![MPCTerm {
                node_id: 2,
                dof: axis + 3,
                coefficient: 1.0,
            }],
        }));

    let expected = solve_modal_3d(&reference, &case.dens, 6).unwrap();
    assert_eq!(expected.modes.len(), 3);
    let expected: Vec<_> = expected.modes.iter().map(|mode| mode.omega).collect();
    let mut failures = Vec::new();
    let mut cases = Vec::new();
    for (label, model) in [
        ("original", case.s.clone()),
        ("reversed", reversed.clone()),
        ("reference", reference),
    ] {
        for (entry, result) in [
            ("modal", solve_modal_3d(&model, &case.dens, 6)),
            (
                "certified modal",
                certify_modal_3d(&model, &case.dens, 6).map(|value| value.results),
            ),
        ] {
            match result {
                Ok(result) => {
                    assert_eq!(result.modes.len(), expected.len(), "{label} {entry}");
                    for (mode, &reference) in result.modes.iter().zip(&expected) {
                        let relative_error = ((mode.omega - reference) / reference).abs();
                        assert!(
                            relative_error <= 1e-12,
                            "{label} {entry}: {} vs {reference}",
                            mode.omega
                        );
                    }
                }
                Err(error) => failures.push(format!("{label} {entry}: {error}")),
            }
        }
        cases.push(serde_json::json!({
            "label": label, "input": {"solver": model, "densities": case.dens}, "expected": expected,
        }));
    }
    for inertia in [1e-20, 1.0] {
        let mut original = case.s.clone();
        let mut reversed = reversed.clone();
        for model in [&mut original, &mut reversed] {
            model.masses.nodal.push(NodalMass3D {
                node_id: 2,
                mass: 0.0,
                mass_x: None,
                mass_y: None,
                mass_z: None,
                ixx: inertia,
                iyy: inertia,
                izz: inertia,
            });
        }
        let original = solve_modal_3d(&original, &case.dens, 6).unwrap();
        assert_eq!(original.null_modes.len(), 1);
        assert_eq!(original.modes.len(), 5);
        let expected: Vec<_> = original.modes.iter().map(|mode| mode.omega).collect();
        let actual = solve_modal_3d(&reversed, &case.dens, 6).unwrap();
        assert_eq!(actual.null_modes.len(), 1);
        assert_eq!(actual.modes.len(), expected.len());
        for (mode, &reference) in actual.modes.iter().zip(&expected) {
            let relative_error = ((mode.omega - reference) / reference).abs();
            assert!(
                relative_error <= 1e-12,
                "inertia {inertia}: {} vs {reference}",
                mode.omega
            );
        }
        cases.push(serde_json::json!({
            "label": format!("reversed with rotary inertia {inertia}"),
            "input": {"solver": reversed, "densities": case.dens}, "expected": expected,
            "nullModesExpected": 1,
        }));
    }
    if let Some(path) = std::env::var_os("MODAL_RELEASE_WASM_CASES") {
        std::fs::write(path, serde_json::to_vec(&cases).unwrap()).unwrap();
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

fn attached_release_tip() -> serde_json::Value {
    serde_json::json!({
        "nodes": {
            "1":{"id":1,"x":0.0,"y":0.0,"z":0.0},
            "2":{"id":2,"x":1.0,"y":0.0,"z":0.0},
            "3":{"id":3,"x":1.0,"y":1.0,"z":0.0},
            "4":{"id":4,"x":2.0,"y":0.0,"z":0.0}
        },
        "elements": {"1":{
            "id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1,
            "localYx":0.0,"localYy":1.0,"localYz":0.0,"releaseMyEnd":true
        }},
        "materials":{"1":{"id":1,"e":200.0,"nu":0.25}},
        "sections":{"1":{"id":1,"a":1.0,"iy":0.01,"iz":0.02,"j":0.01}},
        "supports": ([1, 3, 4].into_iter().map(|id| (id.to_string(), serde_json::json!({
            "nodeId":id,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true
        }))).collect::<serde_json::Map<_, _>>()),
        "loads": []
    })
}

#[test]
fn issue_2608_plate_at_released_tip_stiffens_the_massless_rotation() {
    use dedaliano_engine::{
        certify::modal::certify_modal_3d,
        solver::{linear::solve_3d, modal::solve_modal_3d},
    };
    use serde_json::json;

    let mut model = attached_release_tip();
    model["plates"] = json!({"1":{"id":1,"nodes":[2,3,4],"materialId":1,"thickness":0.2}});
    model["masses"] = json!({"nodal":[{"nodeId":2,"massZ":1.0}]});
    model["loads"] = json!([{"type":"nodal","data":{"nodeId":2,"fx":0.0,"fy":0.0,"fz":1.0,"mx":0.0,"my":0.0,"mz":0.0}}]);
    let input: SolverInput3D = serde_json::from_value(model).unwrap();
    let linear = solve_3d(&input).unwrap();
    let tip = linear.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(tip.uz > 0.0);
    assert_ne!(tip.ry, 0.0);
    let expected = tip.uz.recip().sqrt();
    let densities = Default::default();
    let modal = solve_modal_3d(&input, &densities, 1);
    let certified = certify_modal_3d(&input, &densities, 1).map(|result| result.results);
    if let Some(path) = std::env::var_os("ATTACHED_RELEASE_WASM_CASES") {
        std::fs::write(path, serde_json::to_vec(&json!({
            "input": {"solver":input,"densities":densities},
            "expected":expected
        })).unwrap()).unwrap();
    }
    let mut failures = Vec::new();
    for (name, result) in [("modal", modal), ("certified modal", certified)] {
        match result {
            Ok(result) if result.modes.len() == 1
                && ((result.modes[0].omega - expected) / expected).abs() <= 1e-12 => {}
            other => failures.push(format!("{name}: {other:?} vs {expected}")),
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn issue_2608_connector_at_released_tip_carries_the_applied_moment() {
    use dedaliano_engine::solver::linear::solve_3d;
    use serde_json::json;

    let mut model = attached_release_tip();
    model["connectors"] = json!({"1":{"id":1,"nodeI":2,"nodeJ":4,"kBendZ":10.0}});
    model["loads"] = json!([{"type":"nodal","data":{"nodeId":2,"fx":0.0,"fy":0.0,"fz":0.0,"mx":0.0,"my":1.0,"mz":0.0}}]);
    let supported: SolverInput3D = serde_json::from_value(model).unwrap();
    let mut unloaded = supported.clone();
    unloaded.connectors.clear();
    assert!(solve_nonlinear_material_3d(&material_input(unloaded.clone())).unwrap_err().contains("Nodal moment at node 2 is not supported"));
    unloaded.loads.clear();
    assert!(solve_nonlinear_material_3d(&material_input(unloaded)).unwrap().converged);

    let linear = solve_3d(&supported).unwrap();
    let tip_rotation = |displacements: &[dedaliano_engine::types::Displacement3D]| {
        displacements.iter().find(|d| d.node_id == 2).unwrap().ry
    };
    let expected = tip_rotation(&linear.displacements);
    assert_ne!(expected, 0.0);
    let mut sparse = supported.clone();
    let mut bare_frame = supported.clone();
    bare_frame.nodes.retain(|_, node| node.id <= 2);
    bare_frame.supports.retain(|_, support| support.node_id == 1);
    bare_frame.connectors.clear();
    let pads = separate_cantilevers(&bare_frame, SPARSE_THRESHOLD.div_ceil(6));
    for (key, mut node) in pads.nodes {
        node.id += 4;
        sparse.nodes.insert(format!("pad-{key}"), node);
    }
    for (key, mut member) in pads.elements {
        member.id += 1;
        member.node_i += 4;
        member.node_j += 4;
        sparse.elements.insert(format!("pad-{key}"), member);
    }
    for (key, mut support) in pads.supports {
        support.node_id += 4;
        sparse.supports.insert(format!("pad-{key}"), support);
    }
    assert!(dedaliano_engine::solver::dof::DofNumbering::build_3d(&sparse).n_free >= SPARSE_THRESHOLD);
    let cases: Vec<_> = [supported, sparse]
        .into_iter().map(material_input).collect();
    if let Some(path) = std::env::var_os("SUPPORTED_RELEASE_WASM_CASES") {
        std::fs::write(path, serde_json::to_vec(&json!({"inputs":cases,"expected":expected})).unwrap()).unwrap();
    }
    for input in cases {
        let result = solve_nonlinear_material_3d(&input).unwrap();
        assert!(result.converged);
        let actual = tip_rotation(&result.results.displacements);
        assert!(((actual - expected) / expected).abs() <= 1e-12, "{actual} vs {expected}");
    }
}
