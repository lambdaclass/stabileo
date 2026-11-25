use crate::{ana2, ana3, case::{Case2, Case3}, checks2, checks3, tally::Tally};
use dedaliano_engine::metamorphic::transform::Iso2;
use dedaliano_engine::solver::linear::solve_2d;
use dedaliano_engine::types::SolverInput3D;

fn replay_spatial_rotation(model: &str, analysis: &str, seed: u64) {
    let fixtures: serde_json::Value =
        serde_json::from_str(include_str!("../fixtures/support-invariance.json")).unwrap();
    let data = &fixtures[model];
    let input: SolverInput3D = serde_json::from_value(data.clone()).unwrap();
    let mut case = Case3::new("replay", input);
    if let Some(densities) = data.get("_nightly_dens") {
        case.dens = serde_json::from_value(densities.clone()).unwrap();
    }
    let analyses: Vec<_> = ana3::rows().into_iter().filter(|a| a.name == analysis).collect();
    assert_eq!(analyses.len(), 1);
    let tally = Tally::default();
    checks3::check_case(
        &checks3::Ctx { tally: &tally, rng_seed: seed },
        &case,
        &analyses,
        &["rotation"],
    );
    assert!(tally.failures().is_empty(), "{:?}", tally.failures());
    assert_eq!(tally.symbol(analysis, "rotation"), "✓", "{}", tally.report());
}

#[test]
#[ignore = "known wrong result: #1192"]
fn issue_1192_pinned_and_roller_supports_rotate_as_one_restraint() {
    let model = include_str!("../metamorphic_corpus/nightly/issue-1192.json");
    let case = Case2::new("issue-1192", serde_json::from_str(model).unwrap());
    solve_2d(&case.s).unwrap();

    for iso in [Iso2::mirror_line(0.4), Iso2::rotation(0.3)] {
        let transformed = case.iso(&iso).unwrap();
        assert_eq!(transformed.s.supports.values().filter(|s| s.node_id == 2).count(), 1);
        solve_2d(&transformed.s).unwrap();
    }

    let tally = Tally::default();
    let analyses: Vec<_> = ana2::rows().into_iter().filter(|a| a.name == "linear").collect();
    checks2::check_case(
        &checks2::Ctx { tally: &tally, rng_seed: 2026110204434 },
        &case,
        &analyses,
        &["mirror", "rotation", "units", "relabel"],
    );
    assert!(tally.failures().is_empty(), "{:?}", tally.failures());
    for relation in ["mirror", "rotation", "units", "relabel"] {
        assert_eq!(tally.symbol("linear", relation), "✓", "{}", tally.report());
    }
}

#[test]
#[ignore = "known wrong result: #1827"]
fn issue_1827_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "constrained", 2026110905303);
}

#[test]
#[ignore = "known wrong result: #1832"]
fn issue_1832_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "creep & shrinkage (t = t0)", 2026110905303);
}

#[test]
#[ignore = "known wrong result: #1835"]
fn issue_1835_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "cable solver", 2026110905303);
}

#[test]
#[ignore = "known wrong result: #1836"]
fn issue_1836_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "certified linear", 2026110905303);
}

#[test]
#[ignore = "known wrong result: #1839"]
fn issue_1839_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "harmonic", 2026110905303);
}

#[test]
#[ignore = "known wrong result: #1840"]
fn issue_1840_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "material nonlinear", 2026110905303);
}

#[test]
#[ignore = "known wrong result: #1841"]
fn issue_1841_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "modal", 2026110905303);
}

#[test]
#[ignore = "known wrong result: #1843"]
fn issue_1843_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "load combinations", 2026110905303);
}

#[test]
#[ignore = "known wrong result: #1845"]
fn issue_1845_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "linear", 2026110905303);
}

#[test]
#[ignore = "known wrong result: #1848"]
fn issue_1848_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "kinematic check", 2026110905303);
}

#[test]
#[ignore = "known wrong result: #1860"]
fn issue_1860_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "corotational", 2026110905303);
}

#[test]
#[ignore = "known wrong result: #1829"]
fn issue_1829_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1829", "Winkler (no foundation)", 2026110900251);
}

#[test]
#[ignore = "known wrong result: #1849"]
fn issue_1849_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1829", "linear (load session)", 2026110900251);
}

#[test]
#[ignore = "known wrong result: #1853"]
fn issue_1853_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1829", "contact (no gaps)", 2026110900251);
}

#[test]
#[ignore = "known wrong result: #1863"]
fn issue_1863_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1829", "SSI (no soil springs)", 2026110900251);
}

#[test]
#[ignore = "known wrong result: #2195"]
fn issue_2195_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("2195", "P-Delta", 2026111606393);
}
