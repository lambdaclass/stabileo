use crate::{ana3, case::Case3, checks3, tally::Tally};
use dedaliano_engine::metamorphic::units::Units;
use dedaliano_engine::solver::constraints::{solve_constrained_3d, ConstrainedInput3D};

const FIXTURE: &str = include_str!("../fixtures/conditional-elastic-2519.json");

fn archived_case() -> Case3 {
    Case3::new("replay", serde_json::from_str(FIXTURE).unwrap())
}

#[test]
#[ignore = "known wrong result: #2519"]
fn issue_2519_conditional_elastic_verdict_is_independent_of_units() {
    let case = archived_case();
    let analysis = ana3::rows().into_iter().find(|row| row.name == "constrained").unwrap();
    let tally = Tally::default();
    checks3::check_case(
        &checks3::Ctx { tally: &tally, rng_seed: 2026112405463 },
        &case,
        &[analysis],
        &["units", "rotation", "mirror", "relabel", "reversal", "load order"],
    );
    assert!(tally.failures().is_empty(), "{:?}", tally.failures());
    for (length, force) in [(1.0, 1.0), (1e-3, 1e3), (25.0, 1e-2), (0.3048, 4.448)] {
        let solver = case.units(&Units::froude(length, force)).s;
        let result = solve_constrained_3d(&ConstrainedInput3D { solver, constraints: vec![] });
        assert!(result.is_ok(), "{length}/{force}: {:?}", result.err());
    }
}
