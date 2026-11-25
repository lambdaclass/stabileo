use crate::{case::{Case3, pad_3d}, checks3, tally::Tally};
use dedaliano_engine::metamorphic::{
    relabel::Relabel,
    reversal::reverse_3d,
    transform::Iso3,
    units::Units,
};
use dedaliano_engine::solver::material_nonlinear::solve_nonlinear_material_3d;
use dedaliano_engine::types::{NonlinearMaterialInput3D, SolverInput3D};
use serde_json::Value;

const MODEL: &str = include_str!("../metamorphic_corpus/stability/issue-1090.json");
const SEED: u64 = 20759;

fn case() -> Case3 {
    let archive: Value = serde_json::from_str(MODEL).unwrap();
    let mut case = Case3::new(archive["_nightly_name"].as_str().unwrap(), serde_json::from_str(MODEL).unwrap());
    case.dens = serde_json::from_value(archive["_nightly_dens"].clone()).unwrap();
    case
}

fn material_input(solver: SolverInput3D) -> NonlinearMaterialInput3D {
    NonlinearMaterialInput3D {
        solver,
        material_models: Default::default(),
        section_capacities: Default::default(),
        max_iter: 60,
        tolerance: 1e-10,
        n_increments: 4,
    }
}

fn reversed(case: &Case3) -> Case3 {
    Case3 { s: reverse_3d(&case.s, &|_| true).unwrap(), ..case.clone() }
}

fn assert_settlement(input: NonlinearMaterialInput3D) {
    let support = input.solver.supports.values().find(|s| {
        [s.dx, s.dy, s.dz].iter().flatten().any(|&d| d != 0.0)
    }).unwrap();
    let translation = [support.dx.unwrap_or(0.0), support.dy.unwrap_or(0.0), support.dz.unwrap_or(0.0)];
    let magnitude = translation.iter().fold(0.0_f64, |norm, &v| norm.hypot(v));
    let node = input.solver.elements.values().find(|e| e.id == 1).map(|e| {
        if e.node_i == support.node_id { e.node_j } else { e.node_i }
    }).unwrap();
    let result = solve_nonlinear_material_3d(&input).unwrap();
    assert!(result.converged, "{result:?}");
    let tip = result.results.displacements.iter().find(|d| d.node_id == node).unwrap();
    for (actual, expected) in [tip.ux, tip.uy, tip.uz].into_iter().zip(translation) {
        assert!((actual - expected).abs() <= input.tolerance * magnitude, "{actual} vs {expected}");
    }
}

#[test]
#[ignore = "known wrong result: #1090"]
fn issue_1090_reversed_warping_frame_carries_its_prescribed_translation() {
    let case = case();
    let analysis = crate::ana3::rows().into_iter().find(|row| row.name == "material nonlinear").unwrap();
    let tally = Tally::default();
    checks3::check_case(
        &checks3::Ctx { tally: &tally, rng_seed: SEED },
        &case,
        &[analysis],
        &["reversal"],
    );
    assert!(tally.failures().is_empty(), "{:?}", tally.failures());
    assert_settlement(material_input(reversed(&case).s));
}

#[test]
#[ignore = "known wrong result: #1090"]
fn spatial_material_dense_and_sparse_follow_the_same_settlement() {
    let case = case();
    let images = [
        case.clone(),
        reversed(&case),
        case.iso(&Iso3::about_z(0.47).translated([1.0, 2.0, 3.0])).unwrap(),
        case.mirror(1, [1.0, 2.0, 3.0]).unwrap(),
        case.units(&Units::froude(1e-3, 1e3)),
        case.units(&Units::froude(25.0, 1e-2)),
        case.units(&Units::froude(0.3048, 4.448)),
    ];
    for image in images {
        assert_settlement(material_input(image.s.clone()));
        let (padded, _, _) = pad_3d(&image.s);
        assert_settlement(material_input(padded));
    }
    let relabel = Relabel::random_3d(&case.s, SEED);
    let relabelled = case.relabel(&relabel, SEED);
    let result = solve_nonlinear_material_3d(&material_input(relabelled.s)).unwrap();
    assert!(result.converged);
}
