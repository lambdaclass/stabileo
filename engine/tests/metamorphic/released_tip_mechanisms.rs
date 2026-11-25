use crate::{ana2, ana3, case::{Case2, Case3}, checks2, checks3, response::Resp};
use dedaliano_engine::metamorphic::{
    relabel::Relabel,
    reversal::{reverse_2d, reverse_3d},
    transform::{Iso2, Iso3},
    units::Units,
    Rng,
};
use serde_json::Value;

const FIXTURES: &str = include_str!("../fixtures/released-tip-mechanisms.json");
const NOVEMBER_13: &str = include_str!("../fixtures/nightly-2026-11-13.json");
const UNITS: [(f64, f64); 3] = [(1e-3, 1e3), (25.0, 1e-2), (0.3048, 4.448)];

fn model(fixtures: &str, issue: &str) -> Value {
    serde_json::from_str::<Value>(fixtures).unwrap()[issue].clone()
}

fn case_2d(issue: &str) -> Case2 {
    let fixtures = match issue {
        "2029" | "2061" | "2063" => NOVEMBER_13,
        _ => FIXTURES,
    };
    Case2::new("replay", serde_json::from_value(model(fixtures, issue)).unwrap())
}

fn case_3d(issue: &str) -> Case3 {
    let fixtures = match issue {
        "2119" | "2139" => FIXTURES,
        _ => NOVEMBER_13,
    };
    Case3::new("replay", serde_json::from_value(model(fixtures, issue)).unwrap())
}

fn images_2d(case: &Case2, analysis: &str, seed: u64) -> Vec<Case2> {
    let rng = || Rng::new(seed ^ checks2::hash(&case.name) ^ checks2::hash(analysis));
    let mut rotation = rng();
    let mut mirror = rng();
    let mut relabel = rng();
    let mut images = vec![
        case.clone(),
        case.iso(&Iso2::rotation(rotation.range(0.1, 6.2)).translated(
            rotation.range(-50.0, 50.0), rotation.range(-50.0, 50.0),
        )).unwrap(),
        case.iso(&Iso2::mirror_line(mirror.range(0.0, 3.1)).translated(
            mirror.range(-50.0, 50.0), mirror.range(-5.0, 5.0),
        )).unwrap(),
        case.iso(&Iso2::rotation(std::f64::consts::FRAC_PI_2)).unwrap(),
        Case2 { s: reverse_2d(&case.s, &|_| true), ..case.clone() },
    ];
    let relabel = relabel.next_u64();
    images.push(case.relabel(&Relabel::random_2d(&case.s, relabel), relabel));
    images.extend(UNITS.map(|(length, force)| case.units(&Units::froude(length, force))));
    images
}

fn images_3d(case: &Case3, analysis: &ana3::Ana3, seed: u64) -> Vec<Case3> {
    let rng = || checks3::case_rng(seed, case, analysis);
    let mut mirror = rng();
    let mut reversal = rng();
    let mut members: Vec<_> = case.s.elements.values().map(|member| member.id).collect();
    members.sort_unstable();
    members.retain(|_| reversal.f64() < 0.5);
    let relabel = rng().next_u64();
    let mut images = vec![
        case.clone(),
        case.iso(&checks3::rotation_for(analysis, &mut rng())).unwrap(),
        case.iso(&Iso3::axis_permutation(7)).unwrap(),
        case.mirror(mirror.below(if analysis.motion == ana3::Motion::AboutZ { 2 } else { 3 }),
            [mirror.range(-40.0, 40.0), mirror.range(-40.0, 40.0), mirror.range(-40.0, 40.0)]).unwrap(),
        case.relabel(&Relabel::random_3d(&case.s, relabel), relabel),
        Case3 { s: reverse_3d(&case.s, &|id| members.contains(&id)).unwrap(), ..case.clone() },
        Case3 { s: reverse_3d(&case.s, &|_| true).unwrap(), ..case.clone() },
    ];
    images.extend(UNITS.map(|(length, force)| case.units(&Units::froude(length, force))));
    images
}

fn expect_mechanisms(results: impl Iterator<Item = Result<Resp, String>>) {
    let failures: Vec<_> = results.enumerate().filter_map(|(i, result)| match result {
        Err(error) if error.contains("the structure is a mechanism") => None,
        Err(error) => Some((i, error)),
        Ok(_) => Some((i, "returned results for a mechanism".to_owned())),
    }).collect();
    assert!(failures.is_empty(), "{failures:?}");
}

fn replay_2d(issue: &str, analysis: &str, seed: u64) {
    let case = case_2d(issue);
    let analysis = ana2::rows().into_iter().find(|row| row.name == analysis).unwrap();
    expect_mechanisms(images_2d(&case, analysis.name, seed).iter().map(analysis.run));
}

fn replay_3d(issue: &str, analysis: &str, seed: u64) {
    let case = case_3d(issue);
    let analysis = ana3::rows().into_iter().find(|row| row.name == analysis).unwrap();
    expect_mechanisms(images_3d(&case, &analysis, seed).iter().map(analysis.run));
}

#[test]
fn issue_2266_dense_reference_refuses_the_hinged_cantilever() {
    replay_2d("2266", "linear (dense reference)", 2026111702194);
}

#[test]
fn issue_2380_constrained_entry_refuses_the_hinged_cantilever() {
    replay_2d("2380", "constrained", 2026112003058);
}

#[test]
fn issue_2190_typed_solve_refuses_the_hinged_branch() {
    replay_2d("2190", "linear (WASM typed path)", 2026111607522);
}

#[test]
fn issue_2021_multiple_stages_refuse_the_hinged_cantilever() {
    replay_3d("2021", "staged (loads in two stages)", 2026111300767);
}

#[test]
fn issue_2022_one_stage_refuses_the_hinged_cantilever() {
    replay_3d("2022", "staged (one stage)", 2026111300767);
}

#[test]
fn issue_2043_pdelta_refuses_the_hinged_cantilever() {
    replay_3d("2043", "P-Delta", 2026111300767);
}

#[test]
fn issue_2052_linear_certification_refuses_the_hinged_cantilever() {
    replay_3d("2052", "certified linear", 2026111300767);
}

#[test]
fn issue_2038_cable_entry_refuses_the_hinged_branch() {
    replay_3d("2038", "cable solver", 2026111301189);
}

#[test]
fn issue_2060_load_combinations_refuse_the_hinged_branch() {
    replay_3d("2060", "load combinations", 2026111301189);
}

#[test]
fn issue_2119_gapless_contact_refuses_the_hinged_branch() {
    replay_3d("2119", "contact (no gaps)", 2026111404217);
}

#[test]
fn issue_2139_initial_plastic_elastic_solve_refuses_the_hinged_branch() {
    replay_3d("2139", "plastic collapse", 2026111404217);
}

#[test]
fn mechanisms_refuse_across_factorization_entry_points() {
    for name in [
        "linear", "linear (WASM typed path)", "linear (load session)", "linear (sparse path)",
        "linear (PCG)", "certified linear", "load combinations", "staged (one stage)",
        "staged (loads in two stages)", "P-Delta", "cable solver", "contact (no gaps)",
        "Winkler (no foundation)", "creep & shrinkage (t = t0)",
    ] {
        replay_2d("2266", name, 2026111702194);
    }
    for name in [
        "linear", "linear (load session)", "linear (sparse path)", "linear (PCG)",
        "constrained", "load combinations", "contact (no gaps)",
        "Winkler (no foundation)", "creep & shrinkage (t = t0)",
    ] {
        replay_3d("2052", name, 2026111300767);
    }
}

fn unhinged_2d() -> Case2 {
    let mut case = case_2d("2266");
    case.s.elements.get_mut("1").unwrap().hinge_end = false;
    for load in &mut case.s.loads {
        if let dedaliano_engine::types::SolverLoad::Nodal(load) = load {
            load.node_id = 2;
        }
    }
    case
}

fn unhinged_3d() -> Case3 {
    let mut case = case_3d("2052");
    case.s.elements.get_mut("1").unwrap().release_mz_end = false;
    for load in &mut case.s.loads {
        if let dedaliano_engine::types::SolverLoad3D::Nodal(load) = load {
            load.node_id = 2;
        }
    }
    case
}

#[test]
fn stable_controls_accept_an_end_release_with_independent_restraints() {
    use dedaliano_engine::solver::{constraints, linear};
    use serde_json::json;

    let mut planar = case_2d("2266").s;
    let mut spatial = case_3d("2052").s;
    let mut constrained = json!([{"type":"equalDOF","masterNode":1,"slaveNode":2,"dofs":[0]}]);
    let p = constraints::ConstrainedInput { solver: planar.clone(), constraints: serde_json::from_value(constrained.clone()).unwrap() };
    assert!(constraints::solve_constrained_2d(&p).is_ok());
    constrained[0]["dofs"] = json!([0, 1, 2]);
    let p = constraints::ConstrainedInput3D { solver: spatial.clone(), constraints: serde_json::from_value(constrained).unwrap() };
    assert!(constraints::solve_constrained_3d(&p).is_ok());

    let section = &planar.sections["2"];
    let length = (planar.nodes["2"].x - planar.nodes["1"].x).hypot(planar.nodes["2"].z - planar.nodes["1"].z);
    let spring = planar.materials["1"].e * section.a / length;
    let support = json!({"id":2,"nodeId":2,"type":"spring","kx":spring,"ky":spring,"kz":0.0});
    planar.supports.insert("2".into(), serde_json::from_value(support).unwrap());
    assert!(linear::solve_2d(&planar).is_ok());

    let section = &spatial.sections["1"];
    let a = &spatial.nodes["1"];
    let b = &spatial.nodes["2"];
    let length = (b.x - a.x).hypot(b.y - a.y).hypot(b.z - a.z);
    let spring = spatial.materials["2"].e * section.a / length;
    let support = json!({"nodeId":2,"rx":false,"ry":false,"rz":false,"rrx":false,"rry":false,"rrz":false,
        "kx":spring,"ky":spring,"kz":spring});
    spatial.supports.insert("2".into(), serde_json::from_value(support).unwrap());
    assert!(linear::solve_3d(&spatial).is_ok());

    let control = linear::solve_2d(&unhinged_2d().s).unwrap();
    assert!(control.displacements.iter().any(|d| d.ux != 0.0 || d.uz != 0.0));
    let control = linear::solve_3d(&unhinged_3d().s).unwrap();
    assert!(control.displacements.iter().any(|d| d.ux != 0.0 || d.uy != 0.0 || d.uz != 0.0));
}

#[test]
fn released_tip_wasm_cases() {
    let Ok(path) = std::env::var("RELEASED_TIP_WASM_CASES") else { return };
    use serde_json::json;

    let planar = case_2d("2380");
    let spatial = case_3d("2021");
    let staged = ana3::rows().into_iter().find(|row| row.name == "staged (loads in two stages)").unwrap();
    let planar_cases = images_2d(&planar, "constrained", 2026112003058);
    let spatial_cases = images_3d(&spatial, &staged, 2026111300767);
    let mut cases: Vec<Value> = planar_cases.iter().chain(&[unhinged_2d()]).enumerate().map(|(i, case)| {
        json!({
            "dimension": 2, "input": case.s, "refuses": i < planar_cases.len(),
            "stage": {
                "name": "all",
                "elementsAdded": case.s.elements.values().map(|e| e.id).collect::<Vec<_>>(),
                "supportsAdded": case.s.supports.values().map(|s| s.id).collect::<Vec<_>>(),
                "loadIndices": (0..case.s.loads.len()).collect::<Vec<_>>()
            }
        })
    }).collect();
    cases.extend(spatial_cases.iter().chain(&[unhinged_3d()]).enumerate().map(|(i, case)| {
        json!({
            "dimension": 3, "input": case.s, "refuses": i < spatial_cases.len(),
            "stage": ana3::stage_all(&case.s, (0..case.s.loads.len()).collect()),
        })
    }));
    std::fs::write(path, serde_json::to_vec(&cases).unwrap()).unwrap();
}

#[test]
#[ignore = "known wrong result: #2029"]
fn issue_2029_typed_solve_refuses_the_frame_and_parallel_truss_swing() {
    replay_2d("2029", "linear (WASM typed path)", 2026111302132);
}

#[test]
#[ignore = "known wrong result: #2061"]
fn issue_2061_pcg_refuses_the_frame_and_parallel_truss_swing() {
    replay_2d("2061", "linear (PCG)", 2026111302132);
}

#[test]
#[ignore = "known wrong result: #2063"]
fn issue_2063_linear_refuses_the_connected_frame_swing() {
    replay_2d("2063", "linear", 2026111300670);
}
