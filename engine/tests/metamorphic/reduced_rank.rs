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
#[ignore = "known wrong result: #2266"]
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
#[ignore = "known wrong result: #2380"]
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
#[ignore = "known wrong result: #2380"]
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
    let mut failures = Vec::new();
    for row in crate::ana2::rows().into_iter().filter(|a| {
        entries.contains(&a.name) || a.name == "linear (WASM typed path)"
    }) {
        report(&format!("2D {}", row.name), (row.run)(&case), &mut failures);
    }
    for row in crate::ana3::rows().into_iter().filter(|a| entries.contains(&a.name)) {
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
#[ignore = "known wrong result: #2119"]
fn issue_2119_contact_refuses_unresolved_operator() {
    check_spatial_issue("2119", "contact (no gaps)", 2026111404217, true);
}

#[test]
#[ignore = "known wrong result: #2134"]
fn issue_2134_winkler_refuses_unresolved_operator() {
    check_spatial_issue("2134", "Winkler (no foundation)", 2026111401487, false);
}

#[test]
#[ignore = "known wrong result: #2139"]
fn issue_2139_plastic_refuses_unresolved_operator() {
    check_spatial_issue("2139", "plastic collapse", 2026111404217, false);
}

#[test]
#[ignore = "known wrong result: #2190"]
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
