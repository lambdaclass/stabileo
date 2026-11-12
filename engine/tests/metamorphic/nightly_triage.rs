use crate::response::{disp_2d, disp_3d, Resp};
use dedaliano_engine::metamorphic::conditioning::{self, Conditioning};
use dedaliano_engine::{
    certify,
    solver::{buckling, linear, plastic},
    types::*,
};
use serde_json::Value;

fn assert_displacements_match(got: &Resp, reference: &Resp, cond: Conditioning) {
    assert!(!reference.0.is_empty());
    assert_eq!(got.0.len(), reference.0.len());
    let rel = crate::checks2::rel_for("linear", 0.0, &cond);
    assert!(rel.is_finite() && rel <= conditioning::INCONCLUSIVE);
    let report = crate::analysis_accuracy::compare(
        got,
        reference,
        cond.lchar,
        rel,
        0.0,
        crate::checks2::compliance("linear", &cond),
    )
    .unwrap();
    assert!(report.values > 0);
}

fn assert_rank_two_modes_match(got: &[f64], reference: &[f64], cond: Conditioning) {
    use dedaliano_engine::metamorphic::compare::{compare, Flat};
    assert_eq!(got.len(), 2);
    assert_eq!(reference.len(), 2);
    for values in [got, reference] {
        assert!(values.iter().all(|v| v.is_finite() && *v > 0.0));
    }
    let cond = cond.with_spectrum(
        reference[0].min(reference[1]),
        reference[0].max(reference[1]),
    );
    let rel = crate::checks2::rel_for("certified modal", 0.0, &cond);
    assert!(rel.is_finite() && rel <= conditioning::INCONCLUSIVE);
    for (i, (actual, expected)) in got.iter().zip(reference).enumerate() {
        compare(
            &Flat::scalar(format!("eigenvalue {i}"), *actual),
            &Flat::scalar(format!("eigenvalue {i}"), *expected),
            cond.lchar,
            rel,
        )
        .unwrap();
    }
}

fn modal_eigenvalues(result: &dedaliano_engine::solver::modal::ModalResult) -> Vec<f64> {
    result.modes.iter().map(|m| m.omega * m.omega).collect()
}

fn assert_displacement_substitutions_rejected(reference: Resp, cond: Conditioning) {
    assert_displacements_match(&reference, &reference, cond);
    let mut zero = reference.clone();
    for item in &mut zero.0 {
        item.v.fill(0.0);
    }
    assert!(
        std::panic::catch_unwind(|| assert_displacements_match(&zero, &reference, cond)).is_err()
    );
    let empty = Resp::default();
    assert!(
        std::panic::catch_unwind(|| assert_displacements_match(&empty, &reference, cond)).is_err()
    );
    assert!(std::panic::catch_unwind(|| assert_displacements_match(&empty, &empty, cond)).is_err());
    for index in 0..reference.0.len() {
        for component in 0..reference.0[index].v.len() {
            let mut corrupt = reference.clone();
            corrupt.0[index].v[component] = f64::NAN;
            assert!(std::panic::catch_unwind(|| assert_displacements_match(
                &corrupt, &reference, cond
            ))
            .is_err());
        }
    }
}

#[test]
fn issue_1989_nodal_displacement_oracle_rejects_zero_and_empty_2d() {
    let nodal: SolverInput = serde_json::from_value(witness("nodal-1969")).unwrap();
    let reference = linear::solve_2d(&nodal).unwrap();
    assert_displacement_substitutions_rejected(
        disp_2d(&reference),
        conditioning::of_2d(&nodal).unwrap(),
    );
}

#[test]
fn issue_1989_nodal_displacement_oracle_rejects_zero_and_empty_3d() {
    use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};
    let nodal: SolverInput = serde_json::from_value(witness("nodal-1969")).unwrap();
    let nodal = embed_2d(&nodal, Plane::XZ).unwrap();
    let reference = linear::solve_3d(&nodal).unwrap();
    assert_displacement_substitutions_rejected(
        disp_3d(&reference),
        conditioning::of_3d(&nodal).unwrap(),
    );
}

#[test]
fn issue_1989_rank_two_modal_oracle_rejects_empty_and_wrong_eigenvalues() {
    let value = witness("1965");
    let original: SolverInput = serde_json::from_value(value.clone()).unwrap();
    let densities = serde_json::from_value(value["_nightly_dens"].clone()).unwrap();
    let base = certify::modal::certify_modal_2d(&original, &densities, 6).unwrap();
    let reference = modal_eigenvalues(&base.results);
    let cond = conditioning::of_2d(&original).unwrap();
    assert_rank_two_modes_match(&reference, &reference, cond);
    assert!(std::panic::catch_unwind(|| assert_rank_two_modes_match(&[], &[], cond)).is_err());
    for bad in [
        vec![],
        vec![reference[0]],
        vec![reference[0], reference[1], reference[1]],
        vec![0.0; 2],
        vec![f64::NAN; 2],
        vec![f64::INFINITY; 2],
        vec![reference[0] * 2.0, reference[1]],
        vec![reference[0], reference[1] * 2.0],
    ] {
        assert!(
            std::panic::catch_unwind(|| assert_rank_two_modes_match(&bad, &reference, cond))
                .is_err()
        );
        assert!(
            std::panic::catch_unwind(|| assert_rank_two_modes_match(&reference, &bad, cond))
                .is_err()
        );
    }
}

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
fn issue_1962_buckling_accepts_record_ids_independent_of_map_keys() {
    let bytes = raw("1962");
    let input: SolverInput3D = serde_json::from_slice(&bytes[2..]).unwrap();
    let n = 1 + (bytes[1] & 7) as usize;
    if let Ok(result) = buckling::solve_buckling_3d(&input, n) {
        finite(&result);
    }
}

#[test]
fn issue_1963_plastic_accepts_record_ids_independent_of_map_keys() {
    let bytes = raw("1963");
    let input: PlasticInput3D = serde_json::from_slice(&bytes[2..]).unwrap();
    if let Ok(result) = plastic::solve_plastic_3d(&input) {
        finite(&result);
    }
}

#[test]
fn issue_1964_linear_certificate_accepts_record_ids_independent_of_map_keys() {
    let bytes = raw("1964");
    let input: SolverInput3D = serde_json::from_slice(&bytes[2..]).unwrap();
    if let Ok(result) = certify::certify_linear_3d_full(&input) {
        finite(&result);
    }
}

#[test]
#[ignore = "known wrong result: #1965; false refusal at the modal basis rounding bound"]
fn issue_1965_rotation_preserves_the_two_finite_modes_of_rank_two_mass() {
    let value = witness("1965");
    let original: SolverInput = serde_json::from_value(value.clone()).unwrap();
    let rotated: SolverInput = serde_json::from_value(witness("rotated-1965")).unwrap();
    let densities = serde_json::from_value(value["_nightly_dens"].clone()).unwrap();
    let base = certify::modal::certify_modal_2d(&original, &densities, 6).unwrap();
    let result = certify::modal::certify_modal_2d(&rotated, &densities, 6).unwrap();
    let cond = conditioning::of_2d(&original)
        .unwrap()
        .worst(&conditioning::of_2d(&rotated).unwrap());
    assert_rank_two_modes_match(
        &modal_eigenvalues(&result.results),
        &modal_eigenvalues(&base.results),
        cond,
    );
    finite(&base);
    finite(&result);
}

#[test]
#[ignore = "known wrong result: #1969; false refusal for transverse truss member actions"]
fn issue_1969_transverse_truss_member_loads_reach_the_balance_check() {
    let input: SolverInput = serde_json::from_value(witness("1969")).unwrap();
    let nodal: SolverInput = serde_json::from_value(witness("nodal-1969")).unwrap();
    let reference = linear::solve_2d(&nodal).unwrap();
    finite(&reference);
    let result = linear::solve_2d(&input).unwrap();
    finite(&result);
    let cond = conditioning::of_2d(&input)
        .unwrap()
        .worst(&conditioning::of_2d(&nodal).unwrap());
    assert_displacements_match(&disp_2d(&result), &disp_2d(&reference), cond);
}

#[test]
#[ignore = "known wrong result: #1977; reaction units mismatch with the NL-5/#428 warning"]
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
#[ignore = "known wrong result: #1969; false refusal for transverse truss member actions"]
fn issue_1969_transverse_truss_actions_survive_a_3d_embedding() {
    use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};
    let original: SolverInput = serde_json::from_value(witness("1969")).unwrap();
    let nodal: SolverInput = serde_json::from_value(witness("nodal-1969")).unwrap();
    let original = embed_2d(&original, Plane::XZ).unwrap();
    let nodal = embed_2d(&nodal, Plane::XZ).unwrap();
    let reference = linear::solve_3d(&nodal).unwrap();
    finite(&reference);
    let result = linear::solve_3d(&original).unwrap();
    finite(&result);
    let cond = conditioning::of_3d(&original)
        .unwrap()
        .worst(&conditioning::of_3d(&nodal).unwrap());
    assert_displacements_match(&disp_3d(&result), &disp_3d(&reference), cond);
}
