use cut_strip_feher_2026::{loaded_height, Strip, LENGTH};
use serde_json::Value;

fn comparison() -> Value {
    serde_json::from_str(include_str!("../reference-results/published_comparison.json")).unwrap()
}

#[test]
fn failed_solve_has_no_measured_snap_load() {
    let evidence = comparison();
    let rows = evidence["checks"].as_array().unwrap();
    let unresolved = rows.iter().find(|r| r["id"] == "snap-through-0.5-0.2").unwrap();
    assert!(unresolved["computed"].is_null() && unresolved["observed"].is_null());
    assert_eq!(unresolved["passed"], false);
    assert_eq!(unresolved["status"], "unresolved");
    for id in ["snap-through-0.5-0.5", "snap-back-0.5-0.5"] {
        assert!(rows.iter().find(|r| r["id"] == id).unwrap()["computed"].is_number());
    }
}

#[test]
fn a_loaded_marker_is_not_an_unloaded_height_reference() {
    let evidence = comparison();
    let rows: Vec<_> = evidence["checks"].as_array().unwrap().iter()
        .filter(|r| r["id"].as_str().unwrap().starts_with("height-")).collect();
    assert_eq!(rows.len(), 6);
    for row in rows {
        assert!(row["reference"].is_null() && row["observed"].is_null());
        assert!(row["computed"].is_number());
        assert_eq!(row["passed"], false);
    }
}

#[test]
fn a_height_on_the_inverted_branch_is_withheld() {
    let strip = Strip { a: 0.5, b: 0.5 };
    assert!(loaded_height(&strip, 0.5 * LENGTH, 2.05, 0.05).is_err());
    assert!(loaded_height(&strip, 0.5 * LENGTH, 1.0, 0.05).unwrap() > 0.0);
}

#[test]
fn invalid_load_increments_are_rejected_before_solving() {
    let strip = Strip { a: 0.5, b: 0.5 };
    for step in [0.0, -0.05, f64::NAN, f64::INFINITY] {
        assert!(loaded_height(&strip, 0.5 * LENGTH, 0.0, step).is_err());
    }
}

#[test]
#[ignore = "known wrong result: #2505"]
fn steep_retracing_branches_have_no_recorded_switches() {
    let curves: Value = serde_json::from_str(include_str!("../reference-results/curves.json")).unwrap();
    for (span, b) in [(0.5, 0.8), (0.75, 0.5)] {
        let stored = curves.as_array().unwrap().iter().find(|c| c["span"] == span * LENGTH && c["b"] == b).unwrap();
        assert_eq!(stored["snaps"], serde_json::json!([]));
        let live = cut_strip_feher_2026::load_cycle(&Strip { a: 0.5, b }, span * LENGTH, 4.0, 0.05, 10.0).unwrap();
        assert_eq!(live["snaps"], stored["snaps"]);
    }
}

#[test]
#[ignore = "known wrong result: #2505"]
fn a_steep_continuous_height_is_independent_of_the_first_increment() {
    let strip = Strip { a: 0.5, b: 0.8 };
    let fine = loaded_height(&strip, 0.5 * LENGTH, 2.0, 0.05).unwrap();
    let coarse = loaded_height(&strip, 0.5 * LENGTH, 2.0, 2.0).unwrap();
    assert!((coarse - fine).abs() < 1e-7);
}
