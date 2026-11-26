use crate::{case::{Case3, pad_3d}, checks3, tally::Tally};
use dedaliano_engine::metamorphic::{
    relabel::Relabel,
    reversal::reverse_3d,
    transform::Iso3,
    units::Units,
};
use dedaliano_engine::solver::material_nonlinear::solve_nonlinear_material_3d;
use dedaliano_engine::types::{NonlinearMaterialInput3D, SolverInput3D};
use serde_json::Value;

const MODEL: &str = include_str!("../metamorphic_corpus/stability/issue-1090.json");
const SEED: u64 = 20759;

fn case() -> Case3 {
    let archive: Value = serde_json::from_str(MODEL).unwrap();
    let mut case = Case3::new(archive["_nightly_name"].as_str().unwrap(), serde_json::from_str(MODEL).unwrap());
    case.dens = serde_json::from_value(archive["_nightly_dens"].clone()).unwrap();
    case
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

fn reversed(case: &Case3) -> Case3 {
    Case3 { s: reverse_3d(&case.s, &|_| true).unwrap(), ..case.clone() }
}

fn assert_settlement(input: NonlinearMaterialInput3D) {
    let support = input.solver.supports.values().find(|s| {
        [s.dx, s.dy, s.dz].iter().flatten().any(|&d| d != 0.0)
    }).unwrap();
    let translation = [support.dx.unwrap_or(0.0), support.dy.unwrap_or(0.0), support.dz.unwrap_or(0.0)];
    let magnitude = translation.iter().fold(0.0_f64, |norm, &v| norm.hypot(v));
    let node = input.solver.elements.values().find(|e| e.id == 1).map(|e| {
        if e.node_i == support.node_id { e.node_j } else { e.node_i }
    }).unwrap();
    let result = solve_nonlinear_material_3d(&input).unwrap();
    assert!(result.converged, "{result:?}");
    let tip = result.results.displacements.iter().find(|d| d.node_id == node).unwrap();
    for (actual, expected) in [tip.ux, tip.uy, tip.uz].into_iter().zip(translation) {
        assert!((actual - expected).abs() <= input.tolerance * magnitude, "{actual} vs {expected}");
    }
}

#[test]
#[ignore = "known wrong result: #2609"]
fn archive_metadata_is_removed_only_at_the_solver_root() {
    fn check<T: serde::de::DeserializeOwned + serde::Serialize>(fixture: Value) {
        let control: T = crate::common::nightly_solver(fixture.clone()).unwrap();
        let mut archive = fixture;
        archive["_archive_fixture_test"] = serde_json::json!({"source": "nightly"});
        assert!(serde_json::from_value::<T>(archive.clone()).is_err());
        let solver: T = crate::common::nightly_solver(archive.clone()).unwrap();
        assert_eq!(
            serde_json::to_value(solver).unwrap(),
            serde_json::to_value(&control).unwrap()
        );

        let material = archive["materials"].as_object_mut().unwrap().values_mut().next().unwrap();
        material["_archive_fixture_test"] = serde_json::json!(true);
        let error = crate::common::nightly_solver::<T>(archive.clone()).err().unwrap();
        assert!(error.to_string().contains("unknown field `_archive_fixture_test`"), "{error}");

        let mut archive = serde_json::to_value(control).unwrap();
        archive["archive_fixture_test"] = serde_json::json!(true);
        let error = crate::common::nightly_solver::<T>(archive).err().unwrap();
        assert!(error.to_string().contains("unknown field `archive_fixture_test`"), "{error}");
    }

    let planar: Value =
        serde_json::from_str(include_str!("../fixtures/nightly-triage-2026-11-12.json")).unwrap();
    check::<dedaliano_engine::types::SolverInput>(planar["1965"].clone());
    check::<SolverInput3D>(serde_json::from_str(MODEL).unwrap());
}

#[test]
fn issue_1090_reversed_warping_frame_carries_its_prescribed_translation() {
    let case = case();
    let analysis = crate::ana3::rows().into_iter().find(|row| row.name == "material nonlinear").unwrap();
    let tally = Tally::default();
    checks3::check_case(
        &checks3::Ctx { tally: &tally, rng_seed: SEED },
        &case,
        &[analysis],
        &["reversal"],
    );
    assert!(tally.failures().is_empty(), "{:?}", tally.failures());
    assert_settlement(material_input(reversed(&case).s));
}

#[test]
fn spatial_material_dense_and_sparse_follow_the_same_settlement() {
    let case = case();
    let images = [
        case.clone(),
        reversed(&case),
        case.iso(&Iso3::about_z(0.47).translated([1.0, 2.0, 3.0])).unwrap(),
        case.mirror(1, [1.0, 2.0, 3.0]).unwrap(),
        case.units(&Units::froude(1e-3, 1e3)),
        case.units(&Units::froude(25.0, 1e-2)),
        case.units(&Units::froude(0.3048, 4.448)),
    ];
    for image in images {
        assert_settlement(material_input(image.s.clone()));
        let (padded, _, _) = pad_3d(&image.s);
        assert_settlement(material_input(padded));
    }
    let relabel = Relabel::random_3d(&case.s, SEED);
    let relabelled = case.relabel(&relabel, SEED);
    let result = solve_nonlinear_material_3d(&material_input(relabelled.s)).unwrap();
    assert!(result.converged);
}

fn moment_along_release(mut input: NonlinearMaterialInput3D) -> NonlinearMaterialInput3D {
    let solver = &mut input.solver;
    let member = &solver.elements["1"];
    let a = &solver.nodes[&member.node_i.to_string()];
    let b = &solver.nodes[&member.node_j.to_string()];
    let (_, y, _) = dedaliano_engine::element::compute_local_axes_3d(
        a.x, a.y, a.z, b.x, b.y, b.z, member.local_yx, member.local_yy,
        member.local_yz, member.roll_angle, solver.left_hand.unwrap_or(false),
    );
    solver.loads = serde_json::from_value(serde_json::json!([{
        "type":"nodal",
        "data":{"nodeId":2,"fx":0.0,"fy":0.0,"fz":0.0,"mx":y[0],"my":y[1],"mz":y[2]},
    }])).unwrap();
    input
}

fn unhinged() -> NonlinearMaterialInput3D {
    let mut case = case();
    case.s.elements.get_mut("1").unwrap().release_my_end = false;
    material_input(case.s)
}

fn planar() -> dedaliano_engine::types::NonlinearMaterialInput {
    let cases: Value = serde_json::from_str(include_str!("../fixtures/released-tip-mechanisms.json")).unwrap();
    let mut solver: dedaliano_engine::types::SolverInput = serde_json::from_value(cases["2380"].clone()).unwrap();
    let member = solver.elements.get_mut("1").unwrap();
    member.hinge_start = false;
    member.hinge_end = true;
    solver.loads.clear();
    solver.supports.get_mut("1").unwrap().dz = case().s.supports["1"].dz;
    dedaliano_engine::types::NonlinearMaterialInput {
        solver,
        material_models: Default::default(),
        section_capacities: Default::default(),
        max_iter: 60,
        tolerance: 1e-10,
        n_increments: 4,
    }
}

#[test]
fn unloaded_release_is_a_gauge_and_a_loaded_release_refuses() {
    let released = material_input(case().s);
    let loaded = moment_along_release(released.clone());
    for solver in [loaded.solver.clone(), pad_3d(&loaded.solver).0] {
        let error = solve_nonlinear_material_3d(&material_input(solver)).unwrap_err();
        assert!(error.contains("not supported") && error.contains("rotation"), "{error}");
    }
    let mut constrained = released.clone();
    constrained.solver.constraints = serde_json::from_value(serde_json::json!([
        {"type":"equalDOF","masterNode":1,"slaveNode":2,"dofs":[3,4,5]},
    ])).unwrap();
    assert_settlement(constrained);
    assert_settlement(unhinged());

    let planar = planar();
    let result = dedaliano_engine::solver::material_nonlinear::solve_nonlinear_material_2d(&planar).unwrap();
    assert!(result.converged);
    let translation = planar.solver.supports["1"].dz.unwrap();
    let tip = result.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!((tip.uz - translation).abs() <= planar.tolerance * translation.abs());
}

#[test]
fn material_release_wasm_cases() {
    let Ok(path) = std::env::var("MATERIAL_RELEASE_WASM_CASES") else { return };
    use serde_json::json;

    let case = case();
    let images = [
        case.clone(),
        reversed(&case),
        case.iso(&Iso3::about_z(0.47).translated([1.0, 2.0, 3.0])).unwrap(),
        case.units(&Units::froude(1e-3, 1e3)),
        case.units(&Units::froude(25.0, 1e-2)),
        case.units(&Units::froude(0.3048, 4.448)),
    ];
    let mut cases: Vec<_> = images.into_iter().flat_map(|image| {
        let (padded, _, _) = pad_3d(&image.s);
        [image.s, padded].into_iter().map(|solver| json!({ "dimension": 3, "input": material_input(solver) }))
    }).collect();
    cases.push(json!({ "dimension": 3, "input": unhinged(), "control": true }));
    cases.push(json!({ "dimension": 3, "input": moment_along_release(material_input(case.s)), "refuses": true }));
    cases.push(json!({ "dimension": 2, "input": planar(), "control": true }));
    std::fs::write(path, serde_json::to_vec(&cases).unwrap()).unwrap();
}
