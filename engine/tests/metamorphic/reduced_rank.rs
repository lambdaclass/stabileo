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
        report(label, (row.run)(&model), &mut failures);
        report(label, classification_2d(&model), &mut failures);
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
        report(label, (row.run)(&model), &mut failures);
        report(label, classification_2d(&model), &mut failures);
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
        report(&format!("2D {}", row.name), (row.run)(&case), &mut failures);
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
    report("original", (row.run)(&base), &mut failures);
    assert!((row.run)(&transformed).is_err(), "#{issue} transformed model solved");
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
    report("original", (row.run)(&base), &mut failures);
    assert!((row.run)(&mirrored).is_err(), "#2190 mirrored model solved");
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
#[ignore = "known wrong result: #2584"]
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
                assert!(result2.is_ok(), "{result2:?}");
                assert!(result3.is_ok(), "{result3:?}");
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
