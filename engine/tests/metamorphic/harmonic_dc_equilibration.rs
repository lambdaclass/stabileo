use crate::{ana3, case::Case3, checks3, tally::Tally};
use dedaliano_engine::metamorphic::units::Units;
use dedaliano_engine::solver::harmonic::{solve_harmonic_3d, HarmonicInput3D};

const FIXTURE: &str = include_str!("../fixtures/harmonic-dc-2115.json");

#[test]
#[ignore = "known wrong result: #2115"]
fn issue_2115_harmonic_zero_frequency_verdict_is_independent_of_units() {
    let case = Case3::new("replay", serde_json::from_str(FIXTURE).unwrap());
    let analysis = ana3::rows().into_iter().find(|row| row.name == "harmonic").unwrap();
    let tally = Tally::default();
    checks3::check_case(
        &checks3::Ctx { tally: &tally, rng_seed: 2026111404651 },
        &case,
        &[analysis],
        &["units"],
    );
    assert!(tally.failures().is_empty(), "{:?}", tally.failures());
    for (length, force) in [(1.0, 1.0), (1e-3, 1e3), (25.0, 1e-2), (0.3048, 4.448)] {
        let case = case.units(&Units::froude(length, force));
        let r = solve_harmonic_3d(&HarmonicInput3D {
            solver: case.s,
            densities: case.dens,
            frequencies: case.p.freqs.clone(),
            damping_ratio: 0.05,
            response_node_id: case.probes[0],
            response_dof: "x".into(),
        }).unwrap();
        assert_eq!(r.response_points.len(), case.p.freqs.len());
        assert_eq!(r.response_points[0].frequency, 0.0);
        assert_eq!(r.response_points[0].imag, 0.0);
    }
}
