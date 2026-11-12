use crate::{ana3, case::Case3, checks3, tally::Tally};
use dedaliano_engine::{solver::pdelta, types::SolverInput3D};

#[test]
#[ignore = "known wrong result: #1940"]
fn issue_1940_dkt_pdelta_rotation() {
    let s: SolverInput3D = serde_json::from_str(include_str!(
        "../metamorphic_corpus/feature_matrix/3d-plate--dkt-triangle--strip-cantilever------0-equiv.json"
    )).unwrap();
    let c = Case3::new("feature_matrix/3d-plate--dkt-triangle--strip-cantilever------0-equiv", s);
    assert!(pdelta::solve_pdelta_3d(&c.s, 100, 1e-12).unwrap().converged);
    let tally = Tally::default();
    let ctx = checks3::Ctx { tally: &tally, rng_seed: 20261018 };
    let rows = ana3::rows().into_iter().filter(|a| a.name == "P-Delta").collect::<Vec<_>>();
    checks3::check_case(&ctx, &c, &rows, &["rotation"]);
    assert!(tally.failures().is_empty(), "{}", tally.report());
}
