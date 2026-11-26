use crate::{ana3, case::Case3, checks3, tally::Tally};
use dedaliano_engine::metamorphic::{
    relabel::Relabel,
    reversal::reverse_3d,
    transform::Iso3,
    units::Units,
};
use dedaliano_engine::certify::harmonic::{certify_harmonic_2d, certify_harmonic_3d};
use dedaliano_engine::solver::harmonic::{solve_harmonic_2d, solve_harmonic_3d, HarmonicInput, HarmonicInput3D};
use serde_json::{json, Value};

const FIXTURE: &str = include_str!("../fixtures/harmonic-dc-2115.json");

#[test]
fn issue_2115_harmonic_zero_frequency_verdict_is_independent_of_units() {
    let case = Case3::new("replay", serde_json::from_str(FIXTURE).unwrap());
    let analysis = ana3::rows().into_iter().find(|row| row.name == "harmonic").unwrap();
    let tally = Tally::default();
    checks3::check_case(
        &checks3::Ctx { tally: &tally, rng_seed: 2026111404651 },
        &case,
        &[analysis],
        &["units", "rotation", "mirror", "relabel", "reversal"],
    );
    assert!(tally.failures().is_empty(), "{:?}", tally.failures());
    for case in images(&case) {
        let input = harmonic_3d(case);
        let r = solve_harmonic_3d(&input).unwrap();
        assert_eq!(r.response_points.len(), input.frequencies.len());
        assert_eq!(r.response_points[0].frequency, 0.0);
        assert_eq!(r.response_points[0].imag, 0.0);
        assert_eq!(json!(r), json!(certify_harmonic_3d(&input).unwrap().results));
    }
}

fn images(case: &Case3) -> Vec<Case3> {
    let seed = 2026111404651;
    let mut images = vec![
        case.clone(),
        case.iso(&Iso3::axis_permutation(7).translated([1.0, 2.0, 3.0])).unwrap(),
        case.mirror(1, [1.0, 2.0, 3.0]).unwrap(),
        case.relabel(&Relabel::random_3d(&case.s, seed), seed),
        Case3 { s: reverse_3d(&case.s, &|_| true).unwrap(), ..case.clone() },
    ];
    images.extend([(1e-3, 1e3), (25.0, 1e-2), (0.3048, 4.448)].map(|(l, f)| case.units(&Units::froude(l, f))));
    images
}

fn harmonic_3d(case: Case3) -> HarmonicInput3D {
    HarmonicInput3D {
        solver: case.s,
        densities: case.dens,
        frequencies: case.p.freqs,
        damping_ratio: 0.05,
        response_node_id: case.probes[0],
        response_dof: "x".into(),
    }
}

fn planar_case(refuses: bool) -> HarmonicInput {
    let models: Value = serde_json::from_str(include_str!("../fixtures/released-tip-mechanisms.json")).unwrap();
    let mut case = crate::case::Case2::new("hinged cantilever", serde_json::from_value(models["2380"].clone()).unwrap());
    case.s.elements.get_mut("1").unwrap().hinge_start = refuses;
    let dedaliano_engine::types::SolverLoad::Nodal(load) = &mut case.s.loads[0] else { unreachable!() };
    load.node_id = 2;
    HarmonicInput {
        solver: case.s,
        densities: case.dens,
        frequencies: vec![0.0],
        damping_ratio: 0.05,
        response_node_id: 2,
        response_dof: "y".into(),
    }
}

#[test]
fn planar_zero_frequency_distinguishes_a_cantilever_from_a_base_hinge_mechanism() {
    let stable = planar_case(false);
    let r = solve_harmonic_2d(&stable).unwrap();
    assert!(r.response_points[0].amplitude > 0.0);
    assert_eq!(json!(r), json!(certify_harmonic_2d(&stable).unwrap().results));

    let singular = planar_case(true);
    for result in [
        solve_harmonic_2d(&singular).map(|_| ()),
        certify_harmonic_2d(&singular).map(|_| ()),
    ] {
        assert!(result.unwrap_err().contains("singular"));
    }
}

#[test]
fn harmonic_dc_wasm_cases() {
    let Ok(path) = std::env::var("HARMONIC_DC_WASM_CASES") else { return };
    let case = Case3::new("replay", serde_json::from_str(FIXTURE).unwrap());
    let mut cases: Vec<_> = images(&case).into_iter().map(|case| json!({
        "dimension": 3, "input": harmonic_3d(case)
    })).collect();
    let mut cantilever: dedaliano_engine::types::SolverInput3D =
        serde_json::from_str(include_str!("../metamorphic_corpus/stability/issue-1090.json")).unwrap();
    cantilever.elements.get_mut("1").unwrap().release_my_end = false;
    cantilever.supports.get_mut("1").unwrap().dz = None;
    cantilever.loads = serde_json::from_value(json!([{
        "type":"nodal",
        "data":{"nodeId":2,"fx":0.0,"fy":0.0,"fz":1.0,"mx":0.0,"my":0.0,"mz":0.0}
    }])).unwrap();
    cases.push(json!({"dimension":3, "input":harmonic_3d(Case3::new("cantilever", cantilever)), "control":true}));
    cases.push(json!({"dimension":2, "input":planar_case(false), "control":true}));
    cases.push(json!({"dimension":2, "input":planar_case(true), "refuses":true}));
    std::fs::write(path, serde_json::to_vec(&cases).unwrap()).unwrap();
}
