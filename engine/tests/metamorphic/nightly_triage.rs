use dedaliano_engine::{
    certify,
    solver::{buckling, linear, plastic},
    types::*,
};
use serde_json::Value;

fn witness(key: &str) -> Value {
    let all: Value =
        serde_json::from_str(include_str!("../fixtures/nightly-triage-2026-11-12.json")).unwrap();
    all[key].clone()
}

fn raw(issue: &str) -> Vec<u8> {
    let v = witness(issue);
    let text = v["raw_hex"].as_str().unwrap();
    (0..text.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&text[i..i + 2], 16).unwrap())
        .collect()
}

fn finite<T: serde::Serialize>(r: &T) {
    assert!(certify::finite::non_finite_paths(r).is_empty());
}

#[test]
#[ignore = "known wrong result: #1962"]
fn issue_1962_buckling_accepts_record_ids_independent_of_map_keys() {
    let bytes = raw("1962");
    let input: SolverInput3D = serde_json::from_slice(&bytes[2..]).unwrap();
    let n = 1 + (bytes[1] & 7) as usize;
    if let Ok(result) = buckling::solve_buckling_3d(&input, n) {
        finite(&result);
    }
}

#[test]
#[ignore = "known wrong result: #1963"]
fn issue_1963_plastic_accepts_record_ids_independent_of_map_keys() {
    let bytes = raw("1963");
    let input: PlasticInput3D = serde_json::from_slice(&bytes[2..]).unwrap();
    if let Ok(result) = plastic::solve_plastic_3d(&input) {
        finite(&result);
    }
}

#[test]
#[ignore = "known wrong result: #1964"]
fn issue_1964_linear_certificate_accepts_record_ids_independent_of_map_keys() {
    let bytes = raw("1964");
    let input: SolverInput3D = serde_json::from_slice(&bytes[2..]).unwrap();
    if let Ok(result) = certify::certify_linear_3d_full(&input) {
        finite(&result);
    }
}

#[test]
#[ignore = "known wrong result: #1965"]
fn issue_1965_rotation_preserves_the_two_finite_modes_of_rank_two_mass() {
    let value = witness("1965");
    let original: SolverInput = serde_json::from_value(value.clone()).unwrap();
    let rotated: SolverInput = serde_json::from_value(witness("rotated-1965")).unwrap();
    let densities = serde_json::from_value(value["_nightly_dens"].clone()).unwrap();
    let base = certify::modal::certify_modal_2d(&original, &densities, 6).unwrap();
    let result = certify::modal::certify_modal_2d(&rotated, &densities, 6).unwrap();
    assert_eq!(result.results.modes.len(), base.results.modes.len());
    finite(&result);
}

#[test]
#[ignore = "known wrong result: #1969"]
fn issue_1969_transverse_truss_member_loads_reach_the_balance_check() {
    let input: SolverInput = serde_json::from_value(witness("1969")).unwrap();
    let nodal: SolverInput = serde_json::from_value(witness("nodal-1969")).unwrap();
    let reference = linear::solve_2d(&nodal).unwrap();
    finite(&reference);
    let result = linear::solve_2d(&input).unwrap();
    finite(&result);
    assert_eq!(result.displacements.len(), reference.displacements.len());
}

#[test]
#[ignore = "known wrong result: #1977"]
fn issue_1977_material_reactions_preserve_units() {
    let s = serde_json::from_value(witness("1977")).unwrap();
    let case = crate::case::Case2::new("replay", s);
    let anas: Vec<_> = crate::ana2::rows()
        .into_iter()
        .filter(|a| a.name == "material nonlinear")
        .collect();
    let tally = crate::tally::Tally::default();
    let end = crate::INV_2D.iter().position(|r| *r == "units").unwrap() + 1;
    crate::checks2::check_case(
        &crate::checks2::Ctx {
            tally: &tally,
            rng_seed: 2026111204210,
        },
        &case,
        &anas,
        &crate::INV_2D[..end],
    );
    let cells = tally.cells.lock().unwrap();
    let cell = &cells[&("material nonlinear".to_string(), "units".to_string())];
    assert!(cell.fails.is_empty(), "{:?}", cell.fails);
    assert!(cell.pass > 0);
}

#[test]
fn canonical_record_keys_still_return_their_answer() {
    let input: SolverInput3D = serde_json::from_value(witness("canonical-1962")).unwrap();
    let result = linear::solve_3d(&input).unwrap();
    finite(&result);
    assert_eq!(result.displacements.len(), input.nodes.len());
}

#[test]
fn issue_1969_equivalent_nodal_actions_return_an_answer() {
    let input: SolverInput = serde_json::from_value(witness("nodal-1969")).unwrap();
    let result = linear::solve_2d(&input).unwrap();
    finite(&result);
    assert_eq!(result.displacements.len(), input.nodes.len());
}

#[test]
#[ignore = "known wrong result: #1969"]
fn issue_1969_transverse_truss_actions_survive_a_3d_embedding() {
    use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};
    let original: SolverInput = serde_json::from_value(witness("1969")).unwrap();
    let nodal: SolverInput = serde_json::from_value(witness("nodal-1969")).unwrap();
    let reference = linear::solve_3d(&embed_2d(&nodal, Plane::XZ).unwrap()).unwrap();
    finite(&reference);
    let result = linear::solve_3d(&embed_2d(&original, Plane::XZ).unwrap()).unwrap();
    finite(&result);
    assert_eq!(result.displacements.len(), reference.displacements.len());
}
