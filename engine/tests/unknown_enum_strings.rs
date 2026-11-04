//! An unknown value of an enum-like string input is refused with an error
//! naming the accepted values; it used to fall back silently (spectral
//! direction to Y/Z and rule to CQC, time-history method to Newmark and
//! ground direction to X, diaphragm plane to XY, solver options to their
//! defaults, gravity direction to −Z). Absent optional values keep their
//! documented defaults.

use dedaliano_engine::certify::spectral::{certify_spectral_3d, certify_spectral_results_3d};
use dedaliano_engine::postprocess::influence::{compute_influence_line_3d, InfluenceLineInput3D};
use dedaliano_engine::solver::harmonic::{solve_harmonic_2d, solve_harmonic_3d, HarmonicInput, HarmonicInput3D};
use dedaliano_engine::solver::{linear, modal, moving_loads, spectral, time_integration};
use dedaliano_engine::types::*;
use serde_json::{json, Value};
use std::collections::HashMap;

fn fixture(name: &str) -> Value {
    let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn m2() -> Value {
    fixture("ex-portal-frame-input.json")
}

fn m3() -> Value {
    fixture("ex-3d-portal-frame-input.json")
}

fn dens() -> HashMap<String, f64> {
    [("1".to_string(), 7850.0), ("2".to_string(), 2500.0)].into()
}

fn spectrum() -> Value {
    json!({ "name": "t", "inG": true, "points": [{ "period": 0.0, "sa": 0.4 }, { "period": 2.0, "sa": 0.3 }] })
}

fn spectral_2d() -> SpectralInput {
    let s: SolverInput = serde_json::from_value(m2()).unwrap();
    let modes = modal::solve_modal_2d(&s, &dens(), 3).unwrap().modes;
    serde_json::from_value(json!({ "solver": m2(), "modes": modes, "densities": dens(), "spectrum": spectrum(), "direction": "X" }))
        .unwrap()
}

fn spectral_3d() -> SpectralInput3D {
    let s: SolverInput3D = serde_json::from_value(m3()).unwrap();
    let modes = modal::solve_modal_3d(&s, &dens(), 3).unwrap().modes;
    serde_json::from_value(json!({ "solver": m3(), "modes": modes, "densities": dens(), "spectrum": spectrum(), "direction": "X" }))
        .unwrap()
}

fn assert_refused<T: std::fmt::Debug>(r: Result<T, String>, needles: &[&str]) {
    let e = r.expect_err("unknown value must be refused");
    for n in needles {
        assert!(e.contains(n), "error {e:?} should mention {n:?}");
    }
}

#[test]
fn spectral_direction_unknown_is_refused() {
    let mut i = spectral_2d();
    assert!(spectral::solve_spectral_2d(&i).is_ok());
    i.direction = "Y".into();
    assert!(spectral::solve_spectral_2d(&i).is_ok());
    // 2D has no Z; a lowercase or misspelt direction used to mean Y.
    for bad in ["Z", "x", "XY", ""] {
        i.direction = bad.into();
        assert_refused(spectral::solve_spectral_2d(&i), &["direction", "\"X\"", "\"Y\""]);
    }
    let mut i = spectral_3d();
    for ok in ["X", "Y", "Z"] {
        i.direction = ok.into();
        assert!(spectral::solve_spectral_3d(&i).is_ok(), "{ok}");
    }
    for bad in ["W", "z", "-Z"] {
        i.direction = bad.into();
        assert_refused(spectral::solve_spectral_3d(&i), &["direction", "\"Z\""]);
        assert!(certify_spectral_3d(&i).is_err());
    }
}

#[test]
fn spectral_rule_unknown_is_refused() {
    let mut i = spectral_2d();
    for ok in [None, Some("SRSS"), Some("CQC")] {
        i.rule = ok.map(String::from);
        assert!(spectral::solve_spectral_2d(&i).is_ok(), "{ok:?}");
    }
    for bad in ["ABS", "srss", "cqc ", "Cqc"] {
        i.rule = Some(bad.into());
        assert_refused(spectral::solve_spectral_2d(&i), &["rule", "\"SRSS\"", "\"CQC\""]);
    }
    let mut i = spectral_3d();
    i.rule = Some("ABS".into());
    assert_refused(spectral::solve_spectral_3d(&i), &["rule"]);
}

/// The certificate of caller-supplied results refuses them too.
#[test]
fn spectral_certificate_of_unknown_direction_or_rule_is_uncertified() {
    let i = spectral_3d();
    let res = spectral::solve_spectral_3d(&i).unwrap();
    assert!(certify_spectral_results_3d(&i, &res).is_certified());
    let mut bad = i.clone();
    bad.direction = "W".into();
    assert!(!certify_spectral_results_3d(&bad, &res).is_certified());
    let mut bad = i.clone();
    bad.rule = Some("ABS".into());
    assert!(!certify_spectral_results_3d(&bad, &res).is_certified());
}

fn th_2d() -> TimeHistoryInput {
    serde_json::from_value(json!({ "solver": m2(), "densities": dens(), "timeStep": 0.01, "nSteps": 10,
        "groundAccel": vec![0.5; 10], "groundDirection": "X" }))
    .unwrap()
}

#[test]
fn time_history_unknown_method_or_direction_is_refused() {
    let mut i = th_2d();
    assert!(time_integration::solve_time_history_2d(&i).is_ok());
    for ok in ["X", "x", "Y", "y"] {
        i.ground_direction = Some(ok.into());
        assert!(time_integration::solve_time_history_2d(&i).is_ok(), "{ok}");
    }
    i.ground_direction = Some("Z".into());
    assert_refused(time_integration::solve_time_history_2d(&i), &["groundDirection", "\"X\"", "\"Y\""]);

    let mut i = th_2d();
    // "Wilson" used to run Newmark silently.
    i.method = "Wilson".into();
    assert_refused(time_integration::solve_time_history_2d(&i), &["method", "\"newmark\"", "\"hht\""]);
    // "hht" without α used to run average-acceleration Newmark.
    i.method = "hht".into();
    assert_refused(time_integration::solve_time_history_2d(&i), &["hht", "alpha"]);
    i.alpha = Some(-0.1);
    let r = time_integration::solve_time_history_2d(&i).unwrap();
    assert!(r.method.contains("HHT"), "{}", r.method);
    i.method = "HHT".into();
    assert!(time_integration::solve_time_history_2d(&i).is_ok());

    let mut i3: TimeHistoryInput3D = serde_json::from_value(json!({ "solver": m3(), "densities": dens(),
        "timeStep": 0.01, "nSteps": 10, "groundAccelX": vec![0.5; 10] }))
    .unwrap();
    assert!(time_integration::solve_time_history_3d(&i3).is_ok());
    i3.method = "central".into();
    assert_refused(time_integration::solve_time_history_3d(&i3), &["method"]);
}

#[test]
fn diaphragm_unknown_plane_is_refused() {
    let mut s3: SolverInput3D = serde_json::from_value(m3()).unwrap();
    let mut top: Vec<usize> = s3.nodes.values().filter(|n| n.y > 1.0).map(|n| n.id).collect();
    top.sort();
    let dia = |plane: &str| {
        Constraint::Diaphragm(DiaphragmConstraint { master_node: top[0], slave_nodes: top[1..].to_vec(), plane: plane.into() })
    };
    s3.constraints = vec![dia("XZ")];
    assert!(linear::solve_3d(&s3).is_ok());
    // A misspelt plane used to mean XY.
    for bad in ["xz", "ZX", "XW"] {
        s3.constraints = vec![dia(bad)];
        assert_refused(linear::solve_3d(&s3), &["plane", "\"XY\"", "\"XZ\"", "\"YZ\""]);
    }
    // 2D: only the model plane. The model lies in X–Z and "XY" is its
    // historical name; since #397 both tie the 2D DOFs (ux, uz, ry), so both
    // are accepted and give the same result (diaphragm_rotation.rs). "YZ"
    // names DOFs that do not exist in 2D, and a misspelt plane used to mean XY.
    let mut s2: SolverInput = serde_json::from_value(m2()).unwrap();
    let dia2 = |plane: &str| vec![Constraint::Diaphragm(DiaphragmConstraint { master_node: 2, slave_nodes: vec![3], plane: plane.into() })];
    for bad in ["YZ", "xz", "xy", "ZX", "XW"] {
        s2.constraints = dia2(bad);
        assert_refused(linear::solve_2d(&s2), &["plane", "\"XY\"", "\"XZ\"", "not the plane of a 2D model"]);
    }
    s2.constraints = dia2("XY");
    let xy = linear::solve_2d(&s2).expect("XY is the 2D model plane");
    s2.constraints = dia2("XZ");
    let xz = linear::solve_2d(&s2).expect("XZ is the 2D model plane");
    for (a, b) in xy.displacements.iter().zip(&xz.displacements) {
        assert_eq!(a.node_id, b.node_id);
        assert_eq!((a.ux, a.uz, a.ry), (b.ux, b.uz, b.ry), "node {}", a.node_id);
    }
}

#[test]
fn solver_options_unknown_values_are_refused() {
    let with = |opts: Value| {
        let mut m = m2();
        m["solverOptions"] = opts;
        serde_json::from_value::<SolverInput>(m).unwrap()
    };
    assert!(linear::solve_2d(&with(json!({ "method": "pcg", "preconditioner": "jacobi" }))).is_ok());
    assert_refused(linear::solve_2d(&with(json!({ "method": "conjgate" }))), &["method", "\"auto\"", "\"direct\"", "\"pcg\""]);
    assert_refused(linear::solve_2d(&with(json!({ "preconditioner": "ilu" }))), &["preconditioner", "\"ics\""]);
    assert_refused(linear::solve_2d(&with(json!({ "tolerance": -1.0 }))), &["tolerance"]);
    assert_refused(linear::solve_2d(&with(json!({ "maxIterations": 0 }))), &["maxIterations"]);
    let mut m = m3();
    m["solverOptions"] = json!({ "method": "PCG" });
    assert_refused(linear::solve_3d(&serde_json::from_value(m).unwrap()), &["method"]);
}

#[test]
fn gravity_direction_unknown_is_refused() {
    let elems: Vec<usize> = {
        let s: SolverInput3D = serde_json::from_value(m3()).unwrap();
        let mut v: Vec<usize> = s.elements.keys().map(|k| k.parse().unwrap()).collect();
        v.sort();
        v
    };
    let ml = |g: Option<&str>| -> MovingLoadInput3D {
        let mut v = json!({ "solver": m3(), "train": { "name": "t", "axles": [{ "offset": 0.0, "weight": 10.0 }] },
            "pathElementIds": [elems[elems.len() - 1]] });
        if let Some(g) = g {
            v["gravityDirection"] = json!(g);
        }
        serde_json::from_value(v).unwrap()
    };
    let base = moving_loads::solve_moving_loads_3d(&ml(None));
    if base.is_ok() {
        assert!(moving_loads::solve_moving_loads_3d(&ml(Some("y"))).is_ok());
    }
    assert_refused(moving_loads::solve_moving_loads_3d(&ml(Some("x"))), &["gravityDirection", "\"z\"", "\"y\""]);

    let il = |g: &str| -> InfluenceLineInput3D {
        serde_json::from_value(json!({ "solver": m3(), "quantity": "Fz", "targetNodeId": 1, "gravityDirection": g })).unwrap()
    };
    assert!(compute_influence_line_3d(&il("Z")).is_ok());
    assert_refused(compute_influence_line_3d(&il("down")), &["gravityDirection", "\"z\"", "\"y\""]);
}

#[test]
fn harmonic_and_element_type_unknown_are_refused_with_accepted_values() {
    let h2: HarmonicInput = serde_json::from_value(json!({ "solver": m2(), "densities": dens(),
        "frequencies": [1.0], "dampingRatio": 0.05, "responseNodeId": 3, "responseDof": "z" }))
    .unwrap();
    assert_refused(solve_harmonic_2d(&h2), &["\"x\"", "\"y\"", "\"rz\""]);
    let h3: HarmonicInput3D = serde_json::from_value(json!({ "solver": m3(), "densities": dens(),
        "frequencies": [1.0], "dampingRatio": 0.05, "responseNodeId": 8, "responseDof": "X" }))
    .unwrap();
    assert_refused(solve_harmonic_3d(&h3), &["\"x\"", "\"w\""]);

    let mut m = m2();
    m["elements"]["1"]["type"] = json!("beam");
    assert_refused(linear::solve_2d(&serde_json::from_value(m).unwrap()), &["beam", "\"frame\"", "\"truss\""]);
}
