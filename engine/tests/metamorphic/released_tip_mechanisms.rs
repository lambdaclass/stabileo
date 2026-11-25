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
    Case2::new("replay", serde_json::from_value(model(FIXTURES, issue)).unwrap())
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
#[ignore = "known wrong result: #2266"]
fn issue_2266_dense_reference_refuses_the_hinged_cantilever() {
    replay_2d("2266", "linear (dense reference)", 2026111702194);
}

#[test]
#[ignore = "known wrong result: #2380"]
fn issue_2380_constrained_entry_refuses_the_hinged_cantilever() {
    replay_2d("2380", "constrained", 2026112003058);
}

#[test]
#[ignore = "known wrong result: #2190"]
fn issue_2190_typed_solve_refuses_the_hinged_branch() {
    replay_2d("2190", "linear (WASM typed path)", 2026111607522);
}

#[test]
#[ignore = "known wrong result: #2021"]
fn issue_2021_multiple_stages_refuse_the_hinged_cantilever() {
    replay_3d("2021", "staged (loads in two stages)", 2026111300767);
}

#[test]
#[ignore = "known wrong result: #2022"]
fn issue_2022_one_stage_refuses_the_hinged_cantilever() {
    replay_3d("2022", "staged (one stage)", 2026111300767);
}

#[test]
#[ignore = "known wrong result: #2043"]
fn issue_2043_pdelta_refuses_the_hinged_cantilever() {
    replay_3d("2043", "P-Delta", 2026111300767);
}

#[test]
#[ignore = "known wrong result: #2052"]
fn issue_2052_linear_certification_refuses_the_hinged_cantilever() {
    replay_3d("2052", "certified linear", 2026111300767);
}

#[test]
#[ignore = "known wrong result: #2038"]
fn issue_2038_cable_entry_refuses_the_hinged_branch() {
    replay_3d("2038", "cable solver", 2026111301189);
}

#[test]
#[ignore = "known wrong result: #2060"]
fn issue_2060_load_combinations_refuse_the_hinged_branch() {
    replay_3d("2060", "load combinations", 2026111301189);
}

#[test]
#[ignore = "known wrong result: #2119"]
fn issue_2119_gapless_contact_refuses_the_hinged_branch() {
    replay_3d("2119", "contact (no gaps)", 2026111404217);
}

#[test]
#[ignore = "known wrong result: #2139"]
fn issue_2139_initial_plastic_elastic_solve_refuses_the_hinged_branch() {
    replay_3d("2139", "plastic collapse", 2026111404217);
}
