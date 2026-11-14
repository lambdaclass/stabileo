use crate::case::Case3;
use crate::checks3::Ctx;
use crate::tally::Tally;
use dedaliano_engine::types::SolverInput3D;

fn rotation(name: &str, text: &str) {
    let input: SolverInput3D = serde_json::from_str(text).unwrap();
    let case = Case3::new(name, input);
    let adapter = crate::ana3::rows().into_iter().find(|analysis| analysis.name == "plastic collapse").unwrap();
    assert!((adapter.run)(&case).is_ok());
    let tally = Tally::default();
    crate::checks3::check_case(&Ctx { tally: &tally, rng_seed: 20261018 }, &case, &[adapter], &["rotation"]);
    let cells = tally.cells.lock().unwrap();
    let cell = &cells[&("plastic collapse".to_string(), "rotation".to_string())];
    assert!(cell.fails.is_empty(), "{cell:?}");
    assert!(cell.pass > 0, "{cell:?}");
}

#[test]
#[ignore = "known wrong result: #2084"]
fn issue_2084_grid_rotation_preserves_the_exact_plastic_geometry() {
    rotation("ex-3d-grid-slab-input", include_str!("../fixtures/ex-3d-grid-slab-input.json"));
}

#[test]
#[ignore = "known wrong result: #2084"]
fn issue_2084_collinear_beam_rotation_preserves_the_exact_plastic_geometry() {
    rotation("ex-3d-torsion-beam-input", include_str!("../fixtures/ex-3d-torsion-beam-input.json"));
}
