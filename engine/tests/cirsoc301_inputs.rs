//! CIRSOC 301-2018 §F.1(3), Ec. F.1-1, evaluated by `postprocess::cirsoc301_inputs` against the
//! closed form of the same equation on diagrams whose quarter-point moments are exact: uniform
//! moment, simply supported and fixed-ended beams under uniform load, a midspan point load, and
//! linear diagrams. Ec. F.1-1 is the same expression as AISC 360-16 Eq. F1-1.

use dedaliano_engine::postprocess::cirsoc301_inputs::*;

fn f11(m_max: f64, m_a: f64, m_b: f64, m_c: f64) -> f64 {
    12.5 * m_max / (2.5 * m_max + 3.0 * m_a + 4.0 * m_b + 3.0 * m_c)
}

fn stations(n: usize, f: impl Fn(f64) -> f64) -> Vec<StationMoment> {
    (0..n).map(|i| { let t = i as f64 / (n - 1) as f64; StationMoment { t, m: f(t) } }).collect()
}

fn input(stations: Vec<StationMoment>, shape: &str) -> MomentGradientInput {
    MomentGradientInput { stations, t_start: 0.0, t_end: 1.0, shape: Some(shape.into()), cantilever_free_end: false }
}

fn computed(stations: Vec<StationMoment>, shape: &str) -> MomentGradient {
    let g = moment_gradient(&input(stations, shape)).unwrap();
    assert_eq!(g.basis, CbBasis::Computed, "{g:?}");
    g
}

fn close(actual: f64, expected: f64) {
    assert!((actual - expected).abs() <= 1e-12 * expected.abs().max(1.0), "{actual} against {expected}");
}

#[test]
fn uniform_moment_is_exactly_one() {
    let g = computed(stations(9, |_| 100.0), "I");
    assert_eq!(g.cb, 1.0);
}

#[test]
fn simply_supported_uniform_load() {
    let g = computed(stations(9, |t| 4.0 * 100.0 * t * (1.0 - t)), "I");
    close(g.cb, 12.5 / 11.0);
    close(g.cb, f11(100.0, 75.0, 100.0, 75.0));
}

#[test]
fn midspan_point_load() {
    let g = computed(stations(9, |t| 100.0 * if t <= 0.5 { 2.0 * t } else { 2.0 * (1.0 - t) }), "H");
    close(g.cb, 12.5 / 9.5);
}

#[test]
fn fixed_ended_uniform_load() {
    let g = computed(stations(17, |t| 6.0 * t - 6.0 * t * t - 1.0), "I");
    close(g.m_max, 1.0);
    close(g.m_a, 0.125);
    close(g.m_b, 0.5);
    close(g.cb, 100.0 / 42.0);
}

#[test]
fn linear_to_zero_and_reversing() {
    close(computed(stations(9, |t| 100.0 * (1.0 - t)), "I").cb, 12.5 / 7.5);
    let g = computed(stations(9, |t| 100.0 * (1.0 - 2.0 * t)), "RHS");
    assert_eq!(g.curvature, Curvature::Double);
    close(g.cb, 12.5 / 5.5);
}

#[test]
fn between_one_and_the_limit_of_the_expression() {
    let diagrams: [&dyn Fn(f64) -> f64; 6] = [
        &|t| (std::f64::consts::PI * t).sin(),
        &|t| t * t * t - 0.3,
        &|t| (1.0 - t) * (1.0 - t),
        &|t| if t < 0.999 { 0.0 } else { 1.0 },
        &|t| 2.0 - t,
        &|t| (7.0 * t).cos(),
    ];
    for f in diagrams {
        let g = computed(stations(41, f), "CHS");
        assert!(g.cb >= 1.0 - 1e-15 && g.cb <= 5.0 + 1e-15, "{g:?}");
    }
}

#[test]
fn the_cantilever_rule_comes_first() {
    let mut i = input(stations(9, |t| 100.0 * (1.0 - t)), "I");
    i.cantilever_free_end = true;
    let g = moment_gradient(&i).unwrap();
    assert_eq!((g.cb, g.basis, g.reason_key), (1.0, CbBasis::UnityRequiredCantilever, "steel.cb.reason.cantilever"));
}

#[test]
fn scope_follows_the_symmetry_of_the_section() {
    let reversing = || stations(9, |t| 100.0 * (1.0 - 2.0 * t));
    for shape in ["U", "C", "T"] {
        assert_eq!(computed(stations(9, |t| 100.0 * (1.0 - t)), shape).symmetry, ShapeSymmetry::Single);
        let g = moment_gradient(&input(reversing(), shape)).unwrap();
        assert_eq!((g.cb, g.basis, g.reason_key), (1.0, CbBasis::UnityOutOfScope, "steel.cb.reason.singlySymmetricDoubleCurvature"));
    }
    for shape in ["Z", "L", "invL", "generic", ""] {
        let g = moment_gradient(&input(stations(9, |_| 100.0), shape)).unwrap();
        assert_eq!((g.cb, g.basis, g.reason_key), (1.0, CbBasis::UnityOutOfScope, "steel.cb.reason.symmetryOutOfScope"));
    }
    let mut none = input(stations(9, |_| 100.0), "I");
    none.shape = None;
    assert_eq!(moment_gradient(&none).unwrap().symmetry, ShapeSymmetry::Unknown);
}

#[test]
fn without_a_diagram_cb_is_one() {
    for n in [0, 1, 2] {
        let g = moment_gradient(&input(stations(n.max(2), |_| 10.0).into_iter().take(n).collect(), "I")).unwrap();
        assert_eq!((g.cb, g.basis), (1.0, CbBasis::UnityNoDiagram));
    }
    let g = moment_gradient(&input(stations(9, |_| 0.0), "I")).unwrap();
    assert_eq!((g.cb, g.basis, g.reason_key, g.curvature), (1.0, CbBasis::UnityNoDiagram, "steel.cb.reason.zeroMoment", Curvature::None));
}

#[test]
fn a_segment_reads_its_own_quarter_points() {
    let mut i = input(stations(9, |t| 100.0 * (1.0 - t)), "I");
    i.t_start = 0.5;
    let g = moment_gradient(&i).unwrap();
    close(g.m_a, 37.5);
    close(g.m_b, 25.0);
    close(g.m_c, 12.5);
    close(g.m_max, 50.0);
}

#[test]
fn non_finite_or_reversed_input_is_refused() {
    for bad in [f64::NAN, f64::INFINITY] {
        let mut s = stations(9, |_| 1.0);
        s[3].m = bad;
        assert!(moment_gradient(&input(s, "I")).is_err());
        let mut s = stations(9, |_| 1.0);
        s[3].t = bad;
        assert!(moment_gradient(&input(s, "I")).is_err());
    }
    let mut i = input(stations(9, |_| 1.0), "I");
    (i.t_start, i.t_end) = (0.8, 0.2);
    assert!(moment_gradient(&i).is_err());
}

#[test]
fn a_moment_only_at_one_end_reaches_twelve_and_a_half_over_two_and_a_half() {
    let g = computed(stations(41, |t| if t < 1.0 { 0.0 } else { 1.0 }), "I");
    assert_eq!(g.cb, 5.0);
}

#[test]
fn negative_zero_is_not_a_sign() {
    let s = vec![StationMoment { t: 0.0, m: -0.0 }, StationMoment { t: 0.5, m: 10.0 }, StationMoment { t: 1.0, m: -0.0 }];
    let g = computed(s, "U");
    assert_eq!(g.curvature, Curvature::Single);
}

#[test]
fn the_quarter_points_interpolate_between_stations() {
    let s = vec![StationMoment { t: 0.0, m: 100.0 }, StationMoment { t: 0.5, m: 50.0 }, StationMoment { t: 1.0, m: 0.0 }];
    let g = computed(s, "I");
    assert_eq!((g.m_a, g.m_b, g.m_c, g.m_max), (75.0, 50.0, 25.0, 100.0));
}

#[test]
fn unsorted_stations_read_as_sorted() {
    let mut s = stations(9, |t| 100.0 * (1.0 - t));
    s.reverse();
    assert_eq!(computed(s, "I"), computed(stations(9, |t| 100.0 * (1.0 - t)), "I"));
}

#[test]
fn the_wasm_request_answers_in_the_app_field_names() {
    let req: Cirsoc301InputsRequest = serde_json::from_str(
        r#"{"op":"momentGradient","stations":[{"t":0,"m":100},{"t":0.5,"m":50},{"t":1,"m":0}],"tStart":0,"tEnd":1,"shape":"I","cantileverFreeEnd":false}"#,
    ).unwrap();
    let v = answer(&req).unwrap();
    assert_eq!(v["basis"], "computed");
    assert_eq!(v["reasonKey"], "steel.cb.reason.computed");
    assert_eq!(v["curvature"], "single");
    assert_eq!(v["symmetry"], "double");
    assert_eq!(v["mA"], 75.0);
    assert_eq!(v["cb"].as_f64().unwrap(), 12.5 / 7.5);
}

#[test]
fn a_sign_change_at_an_interpolated_segment_end_is_double_curvature() {
    let s = [(0.0, -100.0), (0.25, 100.0), (0.5, 0.0), (0.75, 0.0), (1.0, 0.0)]
        .map(|(t, m)| StationMoment { t, m }).to_vec();
    let mut i = input(s, "U");
    (i.t_start, i.t_end) = (0.1, 0.9);
    let g = moment_gradient(&i).unwrap();
    assert_eq!(g.curvature, Curvature::Double);
    assert_eq!((g.cb, g.basis, g.reason_key), (1.0, CbBasis::UnityOutOfScope, "steel.cb.reason.singlySymmetricDoubleCurvature"));
    i.shape = Some("I".into());
    let g = moment_gradient(&i).unwrap();
    close(g.m_max, 100.0);
}

#[test]
fn the_maximum_includes_an_interpolated_segment_end() {
    let s = [(0.0, 200.0), (0.5, 50.0), (0.6, 40.0), (0.8, 20.0), (1.0, 0.0)]
        .map(|(t, m)| StationMoment { t, m }).to_vec();
    let mut i = input(s, "I");
    (i.t_start, i.t_end) = (0.25, 1.0);
    let g = moment_gradient(&i).unwrap();
    close(g.m_max, 125.0);
    close(g.cb, f11(125.0, g.m_a, g.m_b, g.m_c));
}
