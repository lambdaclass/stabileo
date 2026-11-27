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
fn a_start_past_the_limit_load_never_runs_a_path() {
    for elements in [20, 40, 60, 80, 100, 120] {
        let e = run::path_with(1.3, 1.3, 4.0, Distribution::Asymmetric, elements).unwrap_err();
        assert_eq!(e, run::PathError::StartSnaps, "{elements}");
    }
    assert_eq!(run::PathError::StartUnsolved.code(), "start_unsolved");
}

#[test]
fn settings_outside_the_sliders_are_refused() {
    assert!(run::path_with(1.3, 1.3, 4.5, Distribution::Uniform, 60).is_err());
    assert!(run::path_with(1.3, 1.3, 2.5, Distribution::Uniform, 10).is_err());
    assert!(run::path_with(0.9, 1.3, 2.5, Distribution::Uniform, 60).is_err());
}

#[test]
fn slider_limits_accept_the_boundary_and_refuse_both_outside_sides() {
    for q in [0.0, 4.0] {
        for elements in [20, 120] {
            assert!(!matches!(run::path_with(1.0, 0.0, q, Distribution::Uniform, elements), Err(run::PathError::LoadOrMeshOutOfRange)));
        }
    }
    for q in [-f64::EPSILON, 4.0 + 4.0 * f64::EPSILON] {
        assert_eq!(run::path_with(1.0, 0.0, q, Distribution::Uniform, 30).unwrap_err(), run::PathError::LoadOrMeshOutOfRange);
    }
    for elements in [19, 121] {
        assert_eq!(run::path_with(1.0, 0.0, 1.5, Distribution::Uniform, elements).unwrap_err(), run::PathError::LoadOrMeshOutOfRange);
    }
    for (theta, delta) in [(1.0, 0.0), (1.6, 1.8)] {
        assert!(run::path_with(theta, delta, 1.5, Distribution::Uniform, 30).is_ok());
    }
    for (theta, delta) in [(1.0 - f64::EPSILON, 0.0), (1.6 + f64::EPSILON, 0.0), (1.0, -f64::EPSILON), (1.0, 1.8 + f64::EPSILON)] {
        assert_eq!(run::path_with(theta, delta, 1.5, Distribution::Uniform, 30).unwrap_err(), run::PathError::CornerOutOfRange);
    }
}

#[test]
fn optimum_clamp_coordinate_has_its_own_printed_precision_check() {
    let data: serde_json::Value = serde_json::from_str(include_str!("../reference-results/published_comparison.json")).unwrap();
    let rows = data["checks"].as_array().unwrap();
    let load = rows.iter().find(|r| r["id"] == "qlim-half-optimum").unwrap();
    let delta = rows.iter().find(|r| r["id"] == "qlim-half-optimum-delta").unwrap();
    assert_eq!(delta["reference"], load["reference_delta"]);
    assert_eq!(delta["computed"], load["computed_delta"]);
    assert_eq!(delta["tolerance"], 0.0125 / 2. + 0.01 / 2.);
    assert_eq!(delta["passed"], delta["observed"].as_f64().unwrap() <= delta["tolerance"].as_f64().unwrap());
}

#[test]
fn a_steep_upper_branch_at_the_last_load_increment_can_still_start() {
    let path = run::path_with(1.0, 0.0, 2.5, Distribution::Asymmetric, 20).unwrap();
    let height = path["frames"][0]["y_mid"].as_f64().unwrap();
    assert!(height > 0.);
}

#[test]
fn clamp_position_uses_an_absolute_angular_distance() {
    let data: serde_json::Value = serde_json::from_str(include_str!("../reference-results/published_comparison.json")).unwrap();
    let row = data["checks"].as_array().unwrap().iter().find(|r| r["id"] == "qlim-half-optimum-delta").unwrap();
    assert_eq!(row["metric"], "absolute difference");
    let distance = (row["computed"].as_f64().unwrap() - row["reference"].as_f64().unwrap()).abs();
    assert_eq!(row["observed"].as_f64().unwrap(), distance);
}
