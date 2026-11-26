use crate::{ana3, case::Case3, checks3, tally::Tally};
use dedaliano_engine::certify::modal::certify_modal_3d;
use dedaliano_engine::metamorphic::{
    relabel::Relabel,
    reversal::reverse_3d,
    transform::Iso3,
    units::Units,
};
use dedaliano_engine::solver::modal::solve_modal_3d;
use serde_json::json;

const ROTATION: &str = include_str!("../metamorphic_corpus/stability/issue-1351.json");
const REVERSAL: &str = include_str!("../metamorphic_corpus/stability/issue-1635.json");

fn case(model: &str) -> Case3 {
    Case3::new("replay", serde_json::from_str(model).unwrap())
}

fn images(case: &Case3, rng_seed: u64) -> Vec<Case3> {
    let modal = ana3::rows().into_iter().find(|row| row.name == "modal").unwrap();
    let iso = checks3::rotation_for(&modal, &mut checks3::case_rng(rng_seed, case, &modal));
    vec![
        case.clone(),
        case.iso(&iso).unwrap(),
        case.iso(&Iso3::axis_permutation(7).translated([2.0, -5.0, 8.0])).unwrap(),
        case.mirror(1, [2.0, -5.0, 8.0]).unwrap(),
        case.relabel(&Relabel::random_3d(&case.s, rng_seed), rng_seed),
        Case3 { s: reverse_3d(&case.s, &|_| true).unwrap(), ..case.clone() },
        case.units(&Units::froude(1e-3, 1e3)),
        case.units(&Units::froude(25.0, 1e-2)),
        case.units(&Units::froude(0.3048, 4.448)),
    ]
}

fn assert_replay(model: &str, rng_seed: u64, relation: &str) {
    let case = case(model);
    let modal = ana3::rows().into_iter().find(|row| row.name == "modal").unwrap();
    let tally = Tally::default();
    checks3::check_case(
        &checks3::Ctx { tally: &tally, rng_seed },
        &case,
        std::slice::from_ref(&modal),
        &["rotation", "mirror", "relabel", "reversal", "units", "modal orthogonality"],
    );
    let cells = tally.cells.lock().unwrap();
    let cell = &cells[&(modal.name.to_owned(), relation.to_owned())];
    assert_eq!(cell.pass, 1, "{cell:?}");
    assert!(cells.values().all(|cell| cell.fails.is_empty()), "{cells:?}");
    for image in images(&case, rng_seed) {
        let direct = solve_modal_3d(&image.s, &image.dens, 6).unwrap();
        let certified = certify_modal_3d(&image.s, &image.dens, 6).unwrap();
        assert_eq!(direct.modes.len(), 3);
        assert_eq!(json!(direct), json!(certified.results));
    }
}

#[test]
fn issue_1351_rotated_massless_release_has_a_complete_finite_spectrum() {
    assert_replay(ROTATION, 2026110405909, "rotation");
}

#[test]
fn issue_1635_reversed_massless_release_has_a_complete_finite_spectrum() {
    assert_replay(REVERSAL, 2026110706825, "reversal");
}

fn with_base_release(case: &Case3) -> Case3 {
    let mut modified = case.clone();
    let member = modified.s.elements.get_mut("1").unwrap();
    member.release_my_end = true;
    modified
}

#[test]
fn the_massless_release_does_not_hide_a_base_mechanism() {
    for image in images(&with_base_release(&case(REVERSAL)), 2026110706825) {
        for result in [
            solve_modal_3d(&image.s, &image.dens, 6).map(|_| ()),
            certify_modal_3d(&image.s, &image.dens, 6).map(|_| ()),
        ] {
            let error = result.unwrap_err();
            assert!(error.contains("mechanism") || error.contains("conditioning"), "{error}");
        }
    }
}

#[test]
fn released_axis_wasm_cases() {
    let Ok(path) = std::env::var("RELEASED_AXIS_WASM_CASES") else { return };
    let mut rows = Vec::new();
    for (model, seed) in [(ROTATION, 2026110405909), (REVERSAL, 2026110706825)] {
        let unloaded = case(model);
        for (case, refuses) in [(unloaded.clone(), false), (with_base_release(&unloaded), true)] {
            rows.extend(images(&case, seed).iter().map(|image| json!({
                "input": { "solver": image.s, "densities": image.dens }, "refuses": refuses,
            })));
        }
    }
    std::fs::write(path, serde_json::to_vec(&rows).unwrap()).unwrap();
}
