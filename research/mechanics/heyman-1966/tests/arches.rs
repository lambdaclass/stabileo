use masonry_arches_heyman_1966::{collapse, hinges, kinematic, least_thickness, run, PointLoad, Side, Weights};
use std::f64::consts::FRAC_PI_2;

#[test]
fn semicircle_matches_milankovitch_and_ccr() {
    let m = least_thickness(FRAC_PI_2, 400, Weights::True, 1e-12).unwrap();
    assert!((m.eta / 0.107478 - 1.0).abs() < 1e-5, "{}", m.eta);
    assert!((m.beta - 54.4840).abs() < 0.01, "{}", m.beta);
    assert!((m.h / 0.620881 - 1.0).abs() < 1e-5, "{}", m.h);
    let c = least_thickness(FRAC_PI_2, 400, Weights::Centreline, 1e-12).unwrap();
    assert!((c.eta / 0.107426 - 1.0).abs() < 1e-5, "{}", c.eta);
    let sides: Vec<Side> = m.hinges.iter().map(|h| h.side).collect();
    assert_eq!(sides, [Side::Extrados, Side::Intrados, Side::Extrados, Side::Intrados, Side::Extrados]);
}

#[test]
fn least_thickness_grows_towards_the_continuum_value() {
    let etas: Vec<f64> = [51, 101, 201].iter().map(|&n| least_thickness(FRAC_PI_2, n, Weights::True, 1e-12).unwrap().eta).collect();
    assert!(etas[0] < etas[1] && etas[1] < etas[2] && etas[2] < 0.107478, "{etas:?}");
    assert!((etas[0] - 0.107373).abs() < 2e-6 && (etas[1] - 0.107450).abs() < 2e-6 && (etas[2] - 0.107464).abs() < 2e-6, "{etas:?}");
}

#[test]
fn ring_static_and_kinematic_bounds_meet() {
    let arch = run::ring(31, 0.3);
    let x = -1.175;
    let (block, _) = arch.extrados_point(x);
    let load = PointLoad { block, x, p: 1.0 };
    let s = collapse(&arch, &load).unwrap();
    let (k, h) = kinematic(&arch, &load).unwrap();
    assert!((s.lambda - 3.7441).abs() < 1e-4 && ((k - s.lambda) / k).abs() < 1e-9, "{} {k}", s.lambda);
    let found: Vec<usize> = hinges(&arch, &s.e, 1e-6).iter().map(|h| h.joint).collect();
    assert_eq!(found, h.iter().map(|h| h.joint).collect::<Vec<_>>());
    assert_eq!(found, [5, 14, 24, 31]);
}

#[test]
fn too_thin_a_ring_has_no_point_load_run() {
    assert!(run::point_load(31, 0.05, 0.25).is_err());
}

#[test]
fn runs_carry_their_frames_and_mechanism() {
    let r = run::self_weight(90.0, 51, Weights::Centreline).unwrap();
    let frames = r["frames"].as_array().unwrap();
    assert!(frames.iter().any(|f| f["kind"] == "bisection" && f["feasible"] == false));
    assert_eq!(r["bodies"].as_array().unwrap().len(), 4);
    assert!(frames.iter().all(|f| f["e"].as_array().unwrap().len() == 52));
    let p = run::point_load(20, 0.3, 0.25).unwrap();
    assert_eq!(p["bodies"].as_array().unwrap().len(), 3);
    assert!((p["result"]["lambda"].as_f64().unwrap() - 3.7497).abs() < 1e-4);
}

#[test]
fn a_flat_contact_keeps_both_joints_and_forms_one_hinge() {
    use masonry_arches_heyman_1966::mechanism_hinges;
    let arch = masonry_arches_heyman_1966::Arch { r: 1.0, t: 0.1, d: 1.0, gamma: 1.0, alpha: FRAC_PI_2, n: 6, weights: Weights::True };
    let e = [0.05, -0.03, -0.05, 0.05, 0.05, -0.02, 0.05];
    let found: Vec<(usize, Side)> = hinges(&arch, &e, 1e-6).iter().map(|h| (h.joint, h.side)).collect();
    assert_eq!(found, [(0, Side::Extrados), (2, Side::Intrados), (3, Side::Extrados), (4, Side::Extrados), (6, Side::Extrados)]);
    let formed: Vec<usize> = mechanism_hinges(&hinges(&arch, &e, 1e-6), &e).iter().map(|h| h.joint).collect();
    assert_eq!(formed, [0, 2, 3, 6]);
    let flat = least_thickness(FRAC_PI_2, 7, Weights::True, 1e-10).unwrap();
    let joints: Vec<usize> = flat.hinges.iter().map(|h| h.joint).collect();
    assert_eq!(joints, [0, 1, 3, 4, 6, 7]);
    let run = run::self_weight(90.0, 7, Weights::True).unwrap();
    assert_eq!(run["result"]["hinges"].as_array().unwrap().len(), 6);
    assert_eq!(run["bodies"].as_array().unwrap().len(), 4);
}

#[test]
fn the_runs_refuse_inputs_outside_their_range() {
    use run::RunError::Input;
    assert_eq!(run::point_load(0, 0.3, 0.25).unwrap_err(), Input("voussoirs"));
    assert_eq!(run::point_load(2, 0.3, 0.25).unwrap_err(), Input("voussoirs"));
    assert_eq!(run::point_load(run::MAX_VOUSSOIRS + 1, 0.3, 0.25).unwrap_err(), Input("voussoirs"));
    assert_eq!(run::point_load(usize::MAX, 0.3, 0.25).unwrap_err(), Input("voussoirs"));
    for t in [0.0, -0.3, f64::NAN, f64::INFINITY, 5.0] {
        assert_eq!(run::point_load(31, t, 0.25).unwrap_err(), Input("thickness"), "{t}");
    }
    for p in [-0.01, 1.01, f64::NAN] {
        assert_eq!(run::point_load(31, 0.3, p).unwrap_err(), Input("position"), "{p}");
    }
    for p in [0.0, 1.0] {
        assert!(!matches!(run::point_load(31, 0.3, p), Err(Input(_))), "{p}");
    }
    assert_eq!(run::self_weight(90.0, 1, Weights::True).unwrap_err(), Input("voussoirs"));
    assert_eq!(run::self_weight(90.0, run::MAX_VOUSSOIRS + 1, Weights::True).unwrap_err(), Input("voussoirs"));
    for a in [0.0, -10.0, 180.0, f64::NAN] {
        assert_eq!(run::self_weight(a, 51, Weights::True).unwrap_err(), Input("alpha"), "{a}");
    }
}

#[test]
fn a_mechanism_whose_faces_do_not_alternate_is_rejected() {
    use masonry_arches_heyman_1966::{mechanism_multiplier, Hinge};
    let arch = run::ring(31, 0.3);
    let (block, _) = arch.extrados_point(-1.175);
    let load = PointLoad { block, x: -1.175, p: 1.0 };
    let sides = [Side::Intrados, Side::Extrados, Side::Intrados, Side::Extrados];
    let good: [Hinge; 4] = std::array::from_fn(|i| Hinge { joint: [5, 14, 24, 31][i], side: sides[i] });
    assert!(mechanism_multiplier(&arch, &good, &load).is_some());
    let mut bad = good;
    bad[2].side = Side::Extrados;
    assert!(mechanism_multiplier(&arch, &bad, &load).is_none());
}
