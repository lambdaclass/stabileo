use crate::{
    case::{Case2, Case3},
    checks2::hash,
};
use dedaliano_engine::{
    metamorphic::{
        planes::{embed_2d, Plane},
        transform::Iso2,
        units::Units,
        Rng,
    },
    solver::{linear, stability},
    types::{
        Constraint, LinearMPCConstraint, MPCTerm, SolverInput, SolverLoad, SolverNodalLoad,
    },
};

const RANK_REFUSAL: &str = "reduced_stiffness_rank";

fn fixture(issue: &str) -> serde_json::Value {
    let fixtures: serde_json::Value =
        serde_json::from_str(include_str!("../fixtures/reduced-rank.json")).unwrap();
    fixtures[issue].clone()
}

fn model(issue: &str) -> Case2 {
    let input: SolverInput = serde_json::from_value(fixture(issue)).unwrap();
    Case2::new("replay", input)
}

fn space_model(issue: &str) -> Case3 {
    Case3::new("replay", serde_json::from_value(fixture(issue)).unwrap())
}

fn scaled_units(rng: &mut Rng) -> Units {
    let (l, f) = [(1e-3, 1e3), (25.0, 1e-2), (0.3048, 4.448)][rng.below(3)];
    Units::froude(l, f)
}

fn report(label: &str, result: Result<impl std::fmt::Debug, String>, failures: &mut Vec<String>) {
    match result {
        Err(e) if e.find('{').and_then(|start| serde_json::from_str::<serde_json::Value>(&e[start..]).ok())
            .is_some_and(|value| value["structuredDiagnostics"][0]["code"] == RANK_REFUSAL
                && value["structuredDiagnostics"][0]["severity"] == "error") => {}
        Err(e) => failures.push(format!("{label}: {e}")),
        Ok(_) => failures.push(format!("{label}: returned a result")),
    }
}

fn report_proven_swing(label: &str, result: Result<impl std::fmt::Debug, String>, failures: &mut Vec<String>) {
    const EXPECTED: &str = "the structure is a mechanism at nodes [2]: a node can move freely in a direction no member, support or spring stiffens; add supports or members, or remove releases";
    match result {
        Err(error) if error.strip_prefix("Failed to solve case 'A': ").unwrap_or(&error) == EXPECTED => {}
        Err(error) => failures.push(format!("{label}: {error}")),
        Ok(_) => failures.push(format!("{label}: returned a result")),
    }
}

fn classification_2d(case: &Case2) -> Result<(), String> {
    match stability::of_2d(&case.s)?.refusal() {
        Some(e) => Err(e),
        None => Ok(()),
    }
}

#[test]
fn issue_2266_dense_in_original_and_scaled_units() {
    let case = model("2266");
    let entry = "linear (dense reference)";
    let mut rng = Rng::new(2026111702194 ^ hash(&case.name) ^ hash(entry));
    let scaled = case.units(&scaled_units(&mut rng));
    let row = crate::ana2::rows().into_iter().find(|a| a.name == entry).unwrap();
    let mut failures = Vec::new();
    for (label, model) in [("original", case), ("scaled", scaled)] {
        report_proven_swing(label, (row.run)(&model), &mut failures);
        report_proven_swing(label, classification_2d(&model), &mut failures);
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn issue_2380_constrained_in_original_and_rotated_coordinates() {
    let case = model("2380");
    let entry = "constrained";
    let mut rng = Rng::new(2026112003058 ^ hash(&case.name) ^ hash(entry));
    let rotated = case
        .iso(&Iso2::rotation(rng.range(0.1, 6.2)).translated(
            rng.range(-50.0, 50.0),
            rng.range(-50.0, 50.0),
        ))
        .unwrap();
    let row = crate::ana2::rows().into_iter().find(|a| a.name == entry).unwrap();
    let mut failures = Vec::new();
    for (label, model) in [("original", case), ("rotated", rotated)] {
        report_proven_swing(label, (row.run)(&model), &mut failures);
        report_proven_swing(label, classification_2d(&model), &mut failures);
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn issue_2380_through_native_operator_entries() {
    let case = model("2380");
    let spatial = Case3::new("spatial", embed_2d(&case.s, Plane::XZ).unwrap());
    let entries = [
        "linear",
        "linear (load session)",
        "linear (sparse path)",
        "linear (PCG)",
        "certified linear",
        "constrained",
        "load combinations",
        "staged (one stage)",
        "staged (loads in two stages)",
        "contact (no gaps)",
        "Winkler (no foundation)",
        "SSI (no soil springs)",
        "creep & shrinkage (t = t0)",
        "P-Delta",
        "corotational",
        "material nonlinear",
        "modal",
    ];
    let rows2 = crate::ana2::rows();
    let rows3 = crate::ana3::rows();
    let selected2: Vec<_> = entries.into_iter().chain(["linear (WASM typed path)"]).map(|name| {
        let mut matching = rows2.iter().filter(|row| row.name == name);
        let row = matching.next().unwrap_or_else(|| panic!("missing 2D entry {name}"));
        assert!(matching.next().is_none(), "duplicate 2D entry {name}");
        row
    }).collect();
    let selected3: Vec<_> = entries.into_iter().map(|name| {
        let mut matching = rows3.iter().filter(|row| row.name == name);
        let row = matching.next().unwrap_or_else(|| panic!("missing 3D entry {name}"));
        assert!(matching.next().is_none(), "duplicate 3D entry {name}");
        row
    }).collect();
    let mut failures = Vec::new();
    for row in selected2 {
        let label = format!("2D {}", row.name);
        let result = (row.run)(&case);
        if matches!(row.name, "SSI (no soil springs)" | "corotational" | "material nonlinear" | "modal") {
            report(&label, result, &mut failures);
        } else {
            report_proven_swing(&label, result, &mut failures);
        }
    }
    for row in selected3 {
        report(&format!("3D {}", row.name), (row.run)(&spatial), &mut failures);
    }
    report(
        "3D classification",
        stability::of_3d(&spatial.s).and_then(|s| match s.refusal() {
            Some(e) => Err(e),
            None => Ok(()),
        }),
        &mut failures,
    );
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn unhinged_and_independently_restrained_frames_solve() {
    for issue in ["2266", "2380"] {
        let base = model(issue).s;
        let mut unhinged = base.clone();
        let frame = unhinged.elements.get_mut("1").unwrap();
        frame.hinge_end = false;
        frame.hinge_start = false;
        let mut restrained = base;
        restrained.constraints.push(Constraint::LinearMPC(LinearMPCConstraint {
            terms: vec![MPCTerm { node_id: 2, dof: 2, coefficient: 1.0 }],
        }));
        for input in [unhinged, restrained] {
            assert!(stability::of_2d(&input).unwrap().is_stable());
            let result = linear::solve_2d(&input).unwrap();
            let mut node_ids: Vec<_> = result.displacements.iter().map(|u| u.node_id).collect();
            node_ids.sort_unstable();
            let mut expected_ids: Vec<_> = input.nodes.values().map(|node| node.id).collect();
            expected_ids.sort_unstable();
            assert_eq!(node_ids, expected_ids);
            assert!(result.displacements.iter().all(|u| u.ux == 0.0 && u.uz == 0.0 && u.ry == 0.0));
        }
    }
}


fn check_spatial_issue(issue: &str, entry: &str, seed: u64, rotation: bool) {
    let base = space_model(issue);
    let row = crate::ana3::rows().into_iter().find(|a| a.name == entry).unwrap();
    let mut rng = Rng::new(seed ^ hash(&base.name) ^ hash(entry) ^ 0x3d);
    let transformed = if rotation {
        base.iso(&crate::checks3::rotation_for(&row, &mut rng)).unwrap()
    } else {
        base.units(&scaled_units(&mut rng))
    };
    let mut failures = Vec::new();
    report_proven_swing("original", (row.run)(&base), &mut failures);
    report_proven_swing(&format!("#{issue} transformed"), (row.run)(&transformed), &mut failures);
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn issue_2119_contact_refuses_unresolved_operator() {
    check_spatial_issue("2119", "contact (no gaps)", 2026111404217, true);
}

#[test]
fn issue_2134_winkler_refuses_unresolved_operator() {
    check_spatial_issue("2134", "Winkler (no foundation)", 2026111401487, false);
}

#[test]
fn issue_2139_plastic_refuses_unresolved_operator() {
    check_spatial_issue("2139", "plastic collapse", 2026111404217, false);
}

#[test]
fn issue_2190_typed_planar_refuses_unresolved_operator() {
    let base = model("2190");
    let entry = "linear (WASM typed path)";
    let row = crate::ana2::rows().into_iter().find(|a| a.name == entry).unwrap();
    let mut rng = Rng::new(2026111607522 ^ hash(&base.name) ^ hash(entry));
    let iso = Iso2::mirror_line(rng.range(0.0, 3.1)).translated(
        rng.range(-50.0, 50.0),
        rng.range(-50.0, 50.0),
    );
    let mirrored = base.iso(&iso).unwrap();
    let mut failures = Vec::new();
    report_proven_swing("original", (row.run)(&base), &mut failures);
    report_proven_swing("#2190 mirrored", (row.run)(&mirrored), &mut failures);
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn rotational_spring_and_connector_resolve_the_same_released_motion() {
    let mut base = model("2380").s;
    base.loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: 0.0,
        fz: 0.0,
        my: 1.0,
    }));
    let stiffness = 10.0;
    let mut spring = base.clone();
    spring.supports.insert("2".into(), serde_json::from_value(serde_json::json!({
        "id": 2, "nodeId": 2, "type": "spring", "kz": stiffness
    })).unwrap());
    let mut connector = base;
    connector.connectors.insert("2".into(), serde_json::from_value(serde_json::json!({
        "id": 2, "nodeI": 1, "nodeJ": 2, "kMoment": stiffness
    })).unwrap());
    let results = [spring, connector].map(|input| {
        assert!(stability::of_2d(&input).unwrap().is_stable());
        let result = linear::solve_2d(&input).unwrap();
        result.displacements.into_iter().find(|u| u.node_id == 2).unwrap()
    });
    let [spring, connector] = results;
    assert_eq!([spring.ux, spring.uz, spring.ry], [connector.ux, connector.uz, connector.ry]);
    assert_eq!(
        [spring.ux, spring.uz, spring.ry].map(f64::to_bits),
        [13846314820451128589, 4622403644748046866, 4591870178932521875],
    );
}

fn truss() -> SolverInput {
    serde_json::from_value(serde_json::json!({
        "nodes": {"1":{"id":1,"x":0,"z":0}, "2":{"id":2,"x":1,"z":0}},
        "elements":{"1":{"id":1,"nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1,"type":"truss","hingeStart":false,"hingeEnd":false}},
        "materials":{"1":{"id":1,"e":0.001,"nu":0.3}},
        "sections":{"1":{"id":1,"a":1,"iz":1}},
        "supports":{"1":{"id":1,"nodeId":1,"type":"fixed"}, "2":{"id":2,"nodeId":2,"type":"spring","ky":1}},
        "loads":[]
    })).unwrap()
}

fn inclined_truss() -> (SolverInput, dedaliano_engine::types::SolverInput3D) {
    let mut planar = truss();
    let angle = 0.4_f64;
    let (x, z) = angle.sin_cos();
    let tip = planar.nodes.get_mut("2").unwrap();
    (tip.x, tip.z) = (x, z);
    let mut spatial = embed_2d(&planar, Plane::XZ).unwrap();
    let support = planar.supports.get_mut("2").unwrap();
    support.support_type = "inclinedRoller".into();
    support.angle = Some(angle);
    support.ky = None;
    let support = spatial.supports.values_mut().find(|s| s.node_id == 2).unwrap();
    support.is_inclined = Some(true);
    support.normal_x = Some(x);
    support.normal_y = Some(0.0);
    support.normal_z = Some(z);
    support.ky = Some(1.0);
    support.kz = None;
    (planar, spatial)
}

#[test]
fn inclined_truss_transverse_motion_is_not_supported() {
    let (planar, spatial) = inclined_truss();
    let mut failures = Vec::new();
    report("2D classification", classification_2d(&Case2::new("inclined", planar.clone())), &mut failures);
    report("3D classification", stability::of_3d(&spatial).and_then(|s| s.refusal().map_or(Ok(()), Err)), &mut failures);
    let kin2 = dedaliano_engine::solver::kinematic::analyze_kinematics_2d(&planar);
    let kin3 = dedaliano_engine::solver::kinematic::analyze_kinematics_3d(&spatial);
    for (dimension, kinematics) in [(2, kin2), (3, kin3)] {
        assert!(!kinematics.is_solvable, "{dimension}D kinematics accepted transverse motion");
        report(&format!("{dimension}D kinematics"), Err::<(), _>(kinematics.diagnosis), &mut failures);
    }
    for dimension in [2, 3] {
        for delta in [0.0, 2.0_f64.powi(-25), 2.0_f64.powi(-20), 0.25] {
            let control = delta >= 2.0_f64.powi(-20);
            if dimension == 2 {
                let mut model = planar.clone();
                model.nodes.get_mut("2").unwrap().x += delta;
                let case = Case2::new("inclined", model);
                for row in crate::ana2::rows().into_iter().filter(|r| [
                    "linear", "linear (dense reference)", "linear (WASM typed path)", "linear (sparse path)",
                    "linear (PCG)", "linear (load session)", "constrained", "corotational", "material nonlinear",
                ].contains(&r.name)) {
                    let result = (row.run)(&case);
                    if control {
                        assert!(result.is_ok(), "{}: {result:?}", row.name);
                    } else {
                        report(&format!("2D {} at offset {delta}", row.name), result, &mut failures);
                    }
                }
            } else {
                let mut model = spatial.clone();
                model.nodes.get_mut("2").unwrap().x += delta;
                let case = Case3::new("inclined", model);
                for row in crate::ana3::rows().into_iter().filter(|r| [
                    "linear", "linear (sparse path)", "linear (PCG)", "linear (load session)", "constrained",
                    "corotational", "material nonlinear",
                ].contains(&r.name)) {
                    let result = (row.run)(&case);
                    if control {
                        assert!(result.is_ok(), "{}: {result:?}", row.name);
                    } else {
                        report(&format!("3D {} at offset {delta}", row.name), result, &mut failures);
                    }
                }
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn corotational_equilibrium_requires_current_tangent_rank() {
    use dedaliano_engine::{
        solver::corotational::{solve_corotational_2d, solve_corotational_2d_from, solve_corotational_3d, CorotationalStart2D},
        types::Displacement,
    };
    let mut failures = Vec::new();
    let epsilon = f64::EPSILON;
    for (force, refused) in [
        (-0.25, false),
        (-0.5 + 64.0 * epsilon, false),
        (-0.5 + 16.0 * epsilon, true),
        (-0.5, true),
        (-0.5 - 16.0 * epsilon, true),
        (-0.5 - 64.0 * epsilon, false),
        (-0.75, false),
    ] {
        let mut model = truss();
        model.loads = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: force, fz: 0.0, my: 0.0 })];
        let mut sparse = crate::case::pad_2d(&model).0;
        sparse.supports.get_mut("2").unwrap().kz = Some(1.0);
        for model in [model, sparse] {
            let spatial = embed_2d(&model, Plane::XZ).unwrap();
            let state: Vec<_> = model.nodes.values().map(|node| Displacement {
                node_id: node.id,
                ux: if node.id == 2 { force } else { 0.0 },
                uz: 0.0,
                ry: 0.0,
            }).collect();
            let start = CorotationalStart2D { input: &model, displacements: &state };
            for modified in [false, true] {
                for (label, result) in [
                    ("2D", solve_corotational_2d(&model, 8, 1e-12, 1, modified).map(|r| (r.converged, r.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux))),
                    ("2D start", solve_corotational_2d_from(&model, Some(&start), 8, 1e-12, 1, modified).map(|r| (r.converged, r.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux))),
                    ("3D", solve_corotational_3d(&spatial, 8, 1e-12, 1, modified).map(|r| (r.converged, r.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux))),
                ] {
                    if refused {
                        report(&format!("{label} at {force:.17}"), result, &mut failures);
                    } else {
                        assert_eq!(result.unwrap(), (true, force), "{label}");
                    }
                }
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}


#[test]
fn restrained_load_does_not_resolve_a_material_mechanism() {
    let rows2 = crate::ana2::rows();
    let rows3 = crate::ana3::rows();
    let planar = rows2.iter().find(|row| row.name == "material nonlinear").unwrap();
    let spatial = rows3.iter().find(|row| row.name == "material nonlinear").unwrap();
    let mut failures = Vec::new();
    for stiffness in [None, Some(1.0)] {
        let mut input = truss();
        input.supports.get_mut("2").unwrap().ky = stiffness;
        input.loads = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 1, fx: 1.0, fz: 0.0, my: 0.0 })];
        let padded = crate::case::pad_2d(&input).0;
        for input in [input, padded] {
            let space = embed_2d(&input, Plane::XZ).unwrap();
            let result2 = (planar.run)(&Case2::new("restrained truss load", input));
            let result3 = (spatial.run)(&Case3::new("restrained truss load", space));
            if stiffness.is_none() {
                report("2D material nonlinear", result2, &mut failures);
                report("3D material nonlinear", result3, &mut failures);
            } else {
                let plane = result2.unwrap();
                let space = result3.unwrap();
                for node in [1, 2] {
                    assert_eq!(plane.node_vec(node, "u").unwrap(), [0.0; 2]);
                    assert_eq!(plane.node_vec(node, "ry").unwrap(), [0.0; 1]);
                    assert_eq!(space.node_vec(node, "u").unwrap(), [0.0; 3]);
                    assert_eq!(space.node_vec(node, "r").unwrap(), [0.0; 3]);
                }
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn ssi_requires_resolved_secant_rank_under_restrained_load() {
    use dedaliano_engine::solver::{soil_curves::SoilCurve, ssi::*};

    let stiffness = 1024.0;
    let rounded = stiffness * 4.0 * f64::EPSILON;
    let mut cholesky = [stiffness + rounded, -stiffness, -stiffness, stiffness];
    assert!(dedaliano_engine::linalg::cholesky_decompose(&mut cholesky, 2));
    let mut planar = serde_json::to_value(truss()).unwrap();
    planar["materials"]["1"]["e"] = serde_json::json!(stiffness / 1000.0);
    planar["nodes"]["3"] = serde_json::json!({"id":3,"x":0,"z":1});
    planar["supports"] = serde_json::json!({
        "1":{"id":1,"nodeId":1,"type":"rollerX"},
        "2":{"id":2,"nodeId":2,"type":"rollerX"},
        "3":{"id":3,"nodeId":3,"type":"fixed"}
    });
    planar["loads"] = serde_json::json!([{"type":"nodal","data":{"nodeId":3,"fx":1,"fz":0,"my":0}}]);
    let planar: SolverInput = serde_json::from_value(planar).unwrap();
    let spatial = embed_2d(&planar, Plane::XZ).unwrap();
    let mut failures = Vec::new();
    for sparse in [false, true] {
        let (mut planar_input, mut spatial_input) = if sparse {
            (crate::case::pad_2d(&planar).0, crate::case::pad_3d(&spatial).0)
        } else {
            (planar.clone(), spatial.clone())
        };
        for constrained in [false, true] {
            if constrained {
                if !sparse {
                    planar_input = crate::case::pad_2d(&planar).0;
                    spatial_input = crate::case::pad_3d(&spatial).0;
                    planar_input.nodes.retain(|_, node| node.id <= 5);
                    spatial_input.nodes.retain(|_, node| node.id <= 5);
                    planar_input.elements.retain(|_, element| element.node_j <= 5);
                    spatial_input.elements.retain(|_, element| element.node_j <= 5);
                }
                let independent = Constraint::LinearMPC(LinearMPCConstraint {
                    terms: vec![MPCTerm { node_id: 5, dof: 0, coefficient: 1.0 }],
                });
                planar_input.constraints.push(independent.clone());
                spatial_input.constraints.push(independent);
            }
            let resolved = if constrained { vec![1.0] } else { vec![1.0, stiffness * 512.0 * f64::EPSILON] };
            for secant in resolved.into_iter().chain([rounded]) {
                let soil = SoilSpring {
                    node_id: 1,
                    direction: 0,
                    curve: SoilCurve::Custom { points: vec![[0.0, 0.0], [1.0, secant]] },
                    tributary_length: 1.0,
                };
                let result2 = solve_ssi_2d(&SSIInput {
                    solver: planar_input.clone(), soil_springs: vec![soil.clone()], max_iter: 2, tolerance: 1e-4,
                });
                let result3 = solve_ssi_3d(&SSIInput3D {
                    solver: spatial_input.clone(), soil_springs: vec![soil], max_iter: 2, tolerance: 1e-4,
                });
                if secant == rounded {
                    report(&format!("planar SSI sparse={sparse} constrained={constrained}"), result2, &mut failures);
                    report(&format!("spatial SSI sparse={sparse} constrained={constrained}"), result3, &mut failures);
                } else {
                    let planar_result = result2.unwrap();
                    let spatial_result = result3.unwrap();
                    assert!(planar_result.converged && spatial_result.converged);
                    assert_eq!(planar_result.results.displacements.len(), planar_input.nodes.len());
                    assert_eq!(spatial_result.results.displacements.len(), spatial_input.nodes.len());
                    assert!(planar_result.results.displacements.iter().all(|u| u.ux == 0.0 && u.uz == 0.0 && u.ry == 0.0));
                    assert!(spatial_result.results.displacements.iter().all(|u| u.ux == 0.0 && u.uy == 0.0 && u.uz == 0.0 && u.rx == 0.0 && u.ry == 0.0 && u.rz == 0.0));
                }
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn collinear_truss_scatter_cannot_create_transverse_stiffness() {
    use dedaliano_engine::solver::corotational::{
        solve_corotational_2d, solve_corotational_2d_from, solve_corotational_3d, CorotationalStart2D,
    };
    use dedaliano_engine::types::Displacement;

    let mut failures = Vec::new();
    for weak_members in [16, 1024] {
        let mut model = truss();
        let chord = 41.0_f64.sqrt();
        let direction = 4.0 / chord;
        let area = chord / (direction * direction);
        model.sections.get_mut("1").unwrap().a = area;
        let mut weak = model.sections["1"].clone();
        weak.id = 2;
        weak.a *= 0.36 * f64::EPSILON;
        model.sections.insert("2".into(), weak);
        let tip = model.nodes.get_mut("2").unwrap();
        (tip.x, tip.z) = (4.0, 5.0);
        model.supports.remove("2");
        model.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1, fx: 1.0, fz: 0.0, my: 0.0,
        })];
        for id in 2..=weak_members + 1 {
            let mut element = model.elements["1"].clone();
            element.id = id;
            element.section_id = 2;
            model.elements.insert(id.to_string(), element);
        }
        let padded = crate::case::pad_2d(&model).0;
        for (sparse, input) in [(false, model), (true, padded)] {
            for restrained in [false, true] {
                let mut input = input.clone();
                let mut spatial = embed_2d(&input, Plane::XZ).unwrap();
                if restrained {
                    input.constraints.push(Constraint::LinearMPC(LinearMPCConstraint {
                        terms: vec![MPCTerm { node_id: 2, dof: 1, coefficient: 1.0 }],
                    }));
                    spatial.constraints.push(Constraint::LinearMPC(LinearMPCConstraint {
                        terms: vec![MPCTerm { node_id: 2, dof: 2, coefficient: 1.0 }],
                    }));
                }
                let displacements: Vec<_> = input.nodes.values().map(|node| Displacement {
                    node_id: node.id, ux: 0.0, uz: 0.0, ry: 0.0,
                }).collect();
                let start = CorotationalStart2D { input: &input, displacements: &displacements };
                for modified in [false, true] {
                    for (label, result) in [
                        ("2D", solve_corotational_2d(&input, 8, 1e-12, 1, modified).map(|r| (r.converged, r.results.displacements.iter().all(|d| d.ux == 0.0 && d.uz == 0.0 && d.ry == 0.0)))),
                        ("2D start", solve_corotational_2d_from(&input, Some(&start), 8, 1e-12, 1, modified).map(|r| (r.converged, r.results.displacements.iter().all(|d| d.ux == 0.0 && d.uz == 0.0 && d.ry == 0.0)))),
                        ("3D", solve_corotational_3d(&spatial, 8, 1e-12, 1, modified).map(|r| (r.converged, r.results.displacements.iter().all(|d| d.ux == 0.0 && d.uy == 0.0 && d.uz == 0.0 && d.rx == 0.0 && d.ry == 0.0 && d.rz == 0.0)))),
                    ] {
                        if restrained {
                            assert_eq!(result.unwrap(), (true, true), "{label}");
                        } else {
                            report(&format!("{label} weak={weak_members} sparse={sparse} modified={modified}"), result, &mut failures);
                        }
                    }
                }
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn ssi_requires_resolved_secant_rank_after_loaded_update() {
    use dedaliano_engine::solver::{soil_curves::SoilCurve, ssi::*};

    let stiffness = 1024.0;
    let rounded = stiffness * 4.0 * f64::EPSILON;
    let mut planar = truss();
    planar.materials.get_mut("1").unwrap().e = stiffness / 1000.0;
    let mut roller = planar.supports["1"].clone();
    roller.support_type = "rollerX".into();
    roller.kz = Some(1.0);
    let mut tip = roller.clone();
    tip.id = 2;
    tip.node_id = 2;
    planar.supports.insert("1".into(), roller);
    planar.supports.insert("2".into(), tip);
    planar.loads = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 1, fx: 1.0, fz: 0.0, my: 0.0 })];
    let mut failures = Vec::new();
    let padded = crate::case::pad_2d(&planar).0;
    for (sparse, input) in [(false, planar), (true, padded)] {
        for constrained in [false, true] {
            let mut input = input.clone();
            let mut spatial = embed_2d(&input, Plane::XZ).unwrap();
            if constrained {
                let root = input.nodes.values().map(|node| node.id).max().unwrap() + 1;
                let end = root + 1;
                for (id, x) in [(root, 0.0), (end, 1.0)] {
                    input.nodes.insert(id.to_string(), dedaliano_engine::types::SolverNode { id, x, z: 1.0 });
                    let mut support = input.supports["1"].clone();
                    support.id = id;
                    support.node_id = id;
                    if id == root {
                        support.support_type = "fixed".into();
                    support.kz = None;
                    }
                    input.supports.insert(id.to_string(), support);
                }
                let mut bar = input.elements["1"].clone();
                bar.id = input.elements.values().map(|element| element.id).max().unwrap() + 1;
                bar.node_i = root;
                bar.node_j = end;
                input.elements.insert(bar.id.to_string(), bar);
                spatial = embed_2d(&input, Plane::XZ).unwrap();
                let constraint = Constraint::LinearMPC(LinearMPCConstraint {
                    terms: vec![MPCTerm { node_id: end, dof: 0, coefficient: 1.0 }],
                });
                input.constraints.push(constraint.clone());
                spatial.constraints.push(constraint);
            }
            for (end, refused) in [(2.0, false), (rounded, true)] {
                for max_iter in [1, 2] {
                    let spring = SoilSpring {
                        node_id: 1, direction: 0, tributary_length: 1.0,
                        curve: SoilCurve::Custom { points: vec![[0.0, 0.0], [end, end]] },
                    };
                    let plane = solve_ssi_2d(&SSIInput {
                        solver: input.clone(), soil_springs: vec![spring.clone()], max_iter, tolerance: 1e-4,
                    });
                    let space = solve_ssi_3d(&SSIInput3D {
                        solver: spatial.clone(), soil_springs: vec![spring], max_iter, tolerance: 1e-4,
                    });
                    if refused {
                        report(&format!("2D SSI sparse={sparse} constrained={constrained} max_iter={max_iter}"), plane, &mut failures);
                        report(&format!("3D SSI sparse={sparse} constrained={constrained} max_iter={max_iter}"), space, &mut failures);
                    } else {
                        let plane = plane.unwrap_or_else(|e| panic!("2D sparse={sparse} constrained={constrained}: {e}"));
                        let space = space.unwrap_or_else(|e| panic!("3D sparse={sparse} constrained={constrained}: {e}"));
                        assert_eq!(plane.converged, max_iter == 2);
                        assert_eq!(space.converged, max_iter == 2);
                        for u in [plane.spring_results[0].displacement, space.spring_results[0].displacement] {
                            assert!((u - 1.0).abs() <= 1e-12, "{u}");
                        }
                    }
                }
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn ssi_released_tip_torque_respects_supported_springs_and_soil_direction_validation() {
    use dedaliano_engine::solver::{soil_curves::SoilCurve, ssi::*};
    let model = serde_json::json!({
        "nodes": {"1":{"id":1,"x":0,"y":0,"z":0},"2":{"id":2,"x":1,"y":0,"z":0}},
        "elements":{"1":{"id":1,"nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1,"type":"frame","releaseTEnd":true}},
        "materials":{"1":{"id":1,"e":0.001,"nu":0.25}},
        "sections":{"1":{"id":1,"a":1,"iy":1,"iz":1,"j":1}},
        "supports":{"1":{"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}},
        "loads":[{"type":"nodal","data":{"nodeId":2,"fx":0,"fy":0,"fz":0,"mx":1,"my":0,"mz":0}}]
    });
    let mut input = SSIInput3D {
        solver: serde_json::from_value(model.clone()).unwrap(),
        soil_springs: vec![], max_iter: 2, tolerance: 1e-4,
    };
    assert!(solve_ssi_3d(&input).unwrap_err().contains("a free rotation would carry load"));
    input.soil_springs.push(SoilSpring {
        node_id: 2, direction: 3, tributary_length: 1.0,
        curve: SoilCurve::Custom { points: vec![[0.0, 0.0], [1.0, 1.0]] },
    });
    let invalid = solve_ssi_3d(&input).unwrap_err();
    assert!(invalid.contains("direction 3 is not a translation"), "{invalid}");
    input.soil_springs.clear();
    let mut held = model;
    held["supports"]["2"] = serde_json::json!({"nodeId":2,"rx":false,"ry":false,"rz":false,"rrx":false,"rry":false,"rrz":false,"krx":1.0});
    input.solver = serde_json::from_value(held).unwrap();
    let answer = solve_ssi_3d(&input).unwrap();
    assert!(answer.converged);
    assert_eq!(answer.results.displacements.iter().find(|d| d.node_id == 2).unwrap().rx, 1.0);
}

#[test]
fn material_rank_is_independent_of_an_artificial_rotation_diagonal() {
    use dedaliano_engine::{
        solver::{dof::DofNumbering, material_nonlinear::solve_nonlinear_material_3d},
        types::{NonlinearMaterialInput3D, SolverInput3D},
    };
    let solver: SolverInput3D = serde_json::from_str(include_str!("../fixtures/reduced-rank-pins.json")).unwrap();
    let padded = crate::case::pad_3d(&solver).0;
    let mut failures = Vec::new();
    for (sparse, model) in [(false, solver), (true, padded)] {
        assert_eq!(DofNumbering::build_3d(&model).n_free >= linear::SPARSE_THRESHOLD, sparse);
        for modulus in [1e15, 1e21] {
            let mut solver = model.clone();
            solver.materials.get_mut("2").unwrap().e = modulus;
            let assert_zero = |results: dedaliano_engine::types::AnalysisResults3D| {
                assert_eq!(results.displacements.len(), solver.nodes.len());
                assert!(results.displacements.iter().all(|d| {
                    [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz] == [0.0; 6]
                }));
            };
            assert_zero(linear::solve_3d(&solver).unwrap());
            let input: NonlinearMaterialInput3D = serde_json::from_value(serde_json::json!({
                "solver": solver, "materialModels": {}, "sectionCapacities": {}, "maxIter": 8,
                "tolerance": 1e-12, "nIncrements": 1
            })).unwrap();
            match solve_nonlinear_material_3d(&input) {
                Ok(result) => {
                    assert!(result.converged);
                    assert_zero(result.results);
                }
                Err(error) => failures.push(format!("sparse={sparse}, modulus={modulus:e}: {error}")),
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn released_rotation_can_move_an_offset_rigid_link_slave() {
    use dedaliano_engine::{
        solver::corotational::{solve_corotational_2d_from, CorotationalStart2D},
        types::{RigidLinkConstraint, SolverNode},
    };
    let mut failures = Vec::new();
    for (offset, released) in [(1.0, true), (0.0, true), (1.0, false)] {
        let mut planar = truss();
        let beam = planar.elements.get_mut("1").unwrap();
        beam.elem_type = "frame".into();
        beam.hinge_end = released;
        planar.supports.remove("2");
        planar.nodes.insert("3".into(), SolverNode { id: 3, x: 1.0 + offset, z: 0.0 });
        let mut space = embed_2d(&planar, Plane::XZ).unwrap();
        let link = |dofs| Constraint::RigidLink(RigidLinkConstraint {
            master_node: 2, slave_node: 3, dofs
        });
        planar.constraints = vec![link(vec![])];
        space.constraints = vec![link(vec![0, 1, 2, 3, 4, 5])];

        let mechanism = offset != 0.0 && released;
        let linear2 = linear::solve_2d(&planar);
        let linear3 = linear::solve_3d(&space);
        if mechanism {
            assert!(linear2.unwrap_err().contains("mechanism"));
            assert!(linear3.unwrap_err().contains("mechanism"));
        } else {
            assert!(linear2.unwrap().displacements.iter().all(|d| [d.ux, d.uz, d.ry] == [0.0; 3]));
            assert!(linear3.unwrap().displacements.iter().all(|d| [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz] == [0.0; 6]));
        }

        let plane = Case2::new("released link", planar);
        let space = Case3::new("released link", space);
        for name in ["corotational", "material nonlinear"] {
            let solve2 = crate::ana2::rows().into_iter().find(|row| row.name == name).unwrap().run;
            let solve3 = crate::ana3::rows().into_iter().find(|row| row.name == name).unwrap().run;
            let result2 = solve2(&plane);
            let result3 = solve3(&space);
            if mechanism {
                report(&format!("2D {name}"), result2, &mut failures);
                report(&format!("3D {name}"), result3, &mut failures);
            } else {
                let result2 = result2.unwrap();
                let result3 = result3.unwrap();
                for node in [1, 2, 3] {
                    assert_eq!(result2.node_vec(node, "u").unwrap(), [0.0; 2]);
                    assert_eq!(result3.node_vec(node, "u").unwrap(), [0.0; 3]);
                }
            }
        }

        let initial = plane.s.clone();
        let displacements = [1, 2, 3].map(|node_id| dedaliano_engine::types::Displacement {
            node_id, ux: 0.0, uz: 0.0, ry: 0.0,
        });
        let start = CorotationalStart2D { input: &initial, displacements: &displacements };
        for modified in [false, true] {
            let result = solve_corotational_2d_from(&plane.s, Some(&start), 8, 1e-12, 1, modified);
            if mechanism {
                report("2D supplied start", result, &mut failures);
            } else {
                let result = result.unwrap();
                assert!(result.converged);
                assert!(result.results.displacements.iter().all(|d| [d.ux, d.uz, d.ry] == [0.0; 3]));
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

fn unit_soil_spring(node_id: usize, direction: usize) -> dedaliano_engine::solver::ssi::SoilSpring {
    use dedaliano_engine::solver::{soil_curves::SoilCurve, ssi::SoilSpring};
    SoilSpring {
        node_id,
        direction,
        tributary_length: 1.0,
        curve: SoilCurve::Custom { points: vec![[0.0, 0.0], [1.0, 1.0]] },
    }
}

#[test]
fn ssi_artificial_rotation_cannot_hold_a_spatial_mechanism() {
    use dedaliano_engine::{solver::{dof::DofNumbering, ssi::*}, types::SolverInput3D};
    let solver: SolverInput3D = serde_json::from_str(include_str!("../fixtures/ssi-artificial-rotation.json")).unwrap();
    let load = solver.sections["1"].iy / 8.0;
    let mut padded = crate::case::pad_3d(&solver).0;
    let mut section = padded.sections["1"].clone();
    section.id = 2;
    section.iy = section.iz;
    padded.sections.insert("2".into(), section);
    for element in padded.elements.values_mut().filter(|e| e.id != 1) {
        element.section_id = 2;
    }

    let mut failures = Vec::new();
    for (sparse, model) in [(false, solver), (true, padded)] {
        assert_eq!(DofNumbering::build_3d(&model).n_free >= linear::SPARSE_THRESHOLD, sparse);
        for inertia in [2_f64.powi(-44), 2_f64.powi(-36)] {
            let mut solver = model.clone();
            solver.sections.get_mut("1").unwrap().iy = inertia;
            let mut input = SSIInput3D {
                solver, soil_springs: vec![], max_iter: 3, tolerance: 1e-10,
            };
            report(&format!("spatial SSI sway, sparse={sparse}, I_y={inertia:e}"), solve_ssi_3d(&input), &mut failures);
            input.soil_springs.push(unit_soil_spring(2, 2));
            match solve_ssi_3d(&input) {
                Ok(result) => {
                    let tip = result.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
                    if !(result.converged && (tip.uz / load - 1.0).abs() <= 1e-12
                        && (tip.ry / load + 1.0).abs() <= 1e-12
                        && (result.spring_results[0].reaction / load - 1.0).abs() <= 1e-12)
                    {
                        failures.push(format!("spatial SSI with soil, sparse={sparse}, I_y={inertia:e}: {tip:?}"));
                    }
                }
                Err(error) => failures.push(error),
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn ssi_released_offset_link_needs_transverse_restraint() {
    use dedaliano_engine::{
        solver::ssi::*,
        types::{RigidLinkConstraint, SolverNode},
    };
    let load = 0.125;
    let mut planar = truss();
    let beam = planar.elements.get_mut("1").unwrap();
    beam.elem_type = "frame".into();
    beam.hinge_end = true;
    planar.supports.remove("2");
    planar.nodes.insert("3".into(), SolverNode { id: 3, x: 2.0, z: 0.0 });
    planar.loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: load, my: 0.0 }));
    let mut spatial = embed_2d(&planar, Plane::XZ).unwrap();
    let link = |dofs| Constraint::RigidLink(RigidLinkConstraint { master_node: 2, slave_node: 3, dofs });
    planar.constraints = vec![link(vec![])];
    spatial.constraints = vec![link(vec![0, 1, 2, 3, 4, 5])];

    let mut failures = Vec::new();
    for (planar, spatial) in [
        (planar.clone(), spatial.clone()),
        (crate::case::pad_2d(&planar).0, crate::case::pad_3d(&spatial).0),
    ] {
        let mut plane = SSIInput { solver: planar, soil_springs: vec![], max_iter: 3, tolerance: 1e-10 };
        let mut space = SSIInput3D { solver: spatial, soil_springs: vec![], max_iter: 3, tolerance: 1e-10 };
        report("planar offset link", solve_ssi_2d(&plane), &mut failures);
        report("spatial offset link", solve_ssi_3d(&space), &mut failures);
        plane.soil_springs.push(unit_soil_spring(3, 1));
        space.soil_springs.push(unit_soil_spring(3, 2));
        let planar = solve_ssi_2d(&plane).unwrap();
        let spatial = solve_ssi_3d(&space).unwrap();
        assert!(planar.converged && spatial.converged);
        for spring in [&planar.spring_results[0], &spatial.spring_results[0]] {
            assert_eq!(spring.displacement, load);
            assert_eq!(spring.reaction, load);
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
