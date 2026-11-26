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
#[ignore = "known wrong result: #964"]
fn issue_964_ssi_refuses_an_axial_member_with_a_free_tip() {
    replay("964", "SSI (no soil springs)", 2026103102530);
}

#[test]
#[ignore = "known wrong result: #967"]
fn issue_967_gapless_contact_refuses_an_axial_member_with_a_free_tip() {
    replay("967", "contact (no gaps)", 2026103100170);
}

#[test]
#[ignore = "known wrong result: #1008"]
fn issue_1008_corotational_refuses_the_unstressed_transverse_mechanism() {
    replay("1008", "corotational", 2026110100526);
}

#[test]
#[ignore = "known wrong result: #1112"]
fn issue_1112_fiber_refuses_the_free_tip_of_an_elastic_truss() {
    replay("1112", "fiber nonlinear", 2026110201488);
}
