use shape_control_feher_2026::{run, Distribution};

#[test]
fn the_paper_settings_are_the_default_path() {
    let paper = run::path(run::CORNER.0, run::CORNER.1).unwrap();
    let same = run::path_with(run::CORNER.0, run::CORNER.1, run::LOAD, Distribution::Uniform, run::ELEMENTS).unwrap();
    assert_eq!(paper, same);
    assert_eq!(paper["distribution"], "uniform");
}

#[test]
fn under_a_lighter_load_the_same_rectangle_brings_the_arch_back() {
    let r = run::path_with(1.3, 1.3, 1.5, Distribution::Uniform, 30).unwrap();
    assert_eq!(r["elements"], 30);
    assert_eq!(r["load"], 1.5);
    let frames = r["frames"].as_array().unwrap();
    assert!(r["lost"].is_null() && r["snaps"].as_array().unwrap().is_empty());
    let (start, end) = (frames[0]["y_mid"].as_f64().unwrap(), frames.last().unwrap()["y_mid"].as_f64().unwrap());
    assert!(start > 0.2 && (end - start).abs() < 1e-3, "{start} {end}");
}

#[test]
fn a_coarse_mesh_inverts_the_strip_like_the_paper_mesh() {
    let coarse = run::path_with(1.3, 1.3, 2.5, Distribution::Uniform, 20).unwrap();
    let end = coarse["frames"].as_array().unwrap().last().unwrap()["y_mid"].as_f64().unwrap();
    assert!((end + 0.15).abs() < 0.005, "{end}");
}

#[test]
fn the_half_span_load_runs_and_reports_its_distribution() {
    let r = run::path_with(1.3, 1.3, 2.0, Distribution::Asymmetric, 60).unwrap();
    assert_eq!(r["distribution"], "asymmetric");
    assert!(r["frames"].as_array().unwrap()[0]["y_mid"].as_f64().unwrap() > 0.0);
}

#[test]
fn an_arch_that_snaps_while_loaded_is_reported_before_the_path() {
    let e = run::path_with(1.3, 1.3, 2.5, Distribution::Asymmetric, 60).unwrap_err();
    assert_eq!(e, run::PathError::StartSnaps);
}

#[test]
fn an_arch_whose_loading_finds_no_equilibrium_is_a_snap_not_a_solver_error() {
    for elements in [80, 90, 100, 120] {
        assert_eq!(run::path_with(1.3, 1.3, 4.0, Distribution::Asymmetric, elements).unwrap_err(), run::PathError::StartSnaps);
    }
    assert_eq!(run::PathError::StartUnsolved.code(), "start_unsolved");
}

#[test]
fn settings_outside_the_sliders_are_refused() {
    assert!(run::path_with(1.3, 1.3, 4.5, Distribution::Uniform, 60).is_err());
    assert!(run::path_with(1.3, 1.3, 2.5, Distribution::Uniform, 10).is_err());
    assert!(run::path_with(0.9, 1.3, 2.5, Distribution::Uniform, 60).is_err());
}
