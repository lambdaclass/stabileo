use crate::units_legacy_3d as legacy_input;
use crate::units_legacy_results as legacy;
use dedaliano_engine::solver::linear::{solve_2d, solve_2d_typed, solve_3d};
use dedaliano_engine::types::units::*;
use dedaliano_engine::types::*;
use serde_json::{json, Value};

fn fixtures(three_d: bool, suffix: &str) -> Vec<(String, String)> {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures");
    let mut out: Vec<(String, String)> = std::fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| {
            let name = p.file_name().unwrap().to_string_lossy();
            name.contains("3d") == three_d && name.ends_with(suffix)
        })
        .map(|p| (p.display().to_string(), std::fs::read_to_string(&p).unwrap()))
        .collect();
    out.sort();
    out
}

fn check_2d(what: &str, r: &AnalysisResults) {
    let expected = legacy::results(r);
    assert_eq!(serde_json::to_string(r).unwrap(), expected, "{what}");
    assert_eq!(serde_json::to_string(&r.clone().into_typed()).unwrap(), expected, "{what}");
    assert_eq!(serde_json::to_string(&r.displacements).unwrap(), legacy::displacements(&r.displacements), "{what}");
    assert_eq!(serde_json::to_string(&r.reactions).unwrap(), legacy::reactions(&r.reactions), "{what}");
    assert_eq!(serde_json::to_string(&r.element_forces).unwrap(), legacy::element_forces(&r.element_forces), "{what}");
}

fn check_3d(what: &str, r: &AnalysisResults3D) {
    let expected = legacy::results_3d(r);
    assert_eq!(serde_json::to_string(r).unwrap(), expected, "{what}");
    assert_eq!(serde_json::to_string(&r.clone().into_typed()).unwrap(), expected, "{what}");
    assert_eq!(serde_json::to_string(&r.displacements).unwrap(), legacy::displacements_3d(&r.displacements), "{what}");
    assert_eq!(serde_json::to_string(&r.reactions).unwrap(), legacy::reactions_3d(&r.reactions), "{what}");
    assert_eq!(serde_json::to_string(&r.element_forces).unwrap(), legacy::element_forces_3d(&r.element_forces), "{what}");
}

#[test]
fn units_2d_results_serialize_to_the_legacy_text_for_every_fixture() {
    let mut solved = vec![];
    for (what, text) in fixtures(false, "input.json") {
        let input = serde_json::from_str::<ElasticInput2D>(&text).unwrap_or_else(|e| panic!("{what}: {e}"));
        let plain_input: SolverInput = serde_json::from_str(&text).unwrap();
        match (solve_2d_typed(&input), solve_2d(&plain_input)) {
            (Ok(typed), Ok(plain)) => {
                check_2d(&what, &typed);
                check_2d(&what, &plain);
                solved.push(what);
            }
            (Err(t), Err(p)) => assert_eq!(t, p, "{what}"),
            (t, p) => panic!("{what}: typed ok {} legacy ok {}", t.is_ok(), p.is_ok()),
        }
    }
    let unsolved: Vec<_> = fixtures(false, "input.json").into_iter().map(|(w, _)| w).filter(|w| !solved.contains(w)).map(|w| short(&w)).collect();
    assert_eq!(unsolved, UNSOLVED_2D, "2D fixtures that do not solve");
}

#[test]
fn units_3d_results_serialize_to_the_legacy_text_for_every_fixture() {
    let mut unsolved = vec![];
    for (what, text) in fixtures(true, "input.json") {
        let input = legacy_input::parse(&text).unwrap_or_else(|e| panic!("{what}: {e}"));
        match solve_3d(&input) {
            Ok(r) => check_3d(&what, &r),
            Err(_) => unsolved.push(short(&what)),
        }
    }
    assert_eq!(unsolved, UNSOLVED_3D, "3D fixtures that do not solve");
}

fn short(path: &str) -> String {
    path.rsplit('/').next().unwrap().to_string()
}

const UNSOLVED_2D: &[&str] = &[];
const UNSOLVED_3D: &[&str] = &[];

#[test]
fn units_stored_result_fixtures_read_back_to_the_same_text() {
    let mut read = 0;
    for (what, text) in fixtures(false, "results.json") {
        let r = serde_json::from_str::<AnalysisResults>(&text).unwrap_or_else(|e| panic!("{what}: {e}"));
        let typed: TypedResults2D = serde_json::from_str(&text).unwrap();
        check_2d(&what, &r);
        assert_eq!(serde_json::to_string(&typed).unwrap(), legacy::results(&r), "{what}");
        read += 1;
    }
    for (what, text) in fixtures(true, "results.json") {
        let r = serde_json::from_str::<AnalysisResults3D>(&text).unwrap_or_else(|e| panic!("{what}: {e}"));
        let typed: TypedResults3D = serde_json::from_str(&text).unwrap();
        check_3d(&what, &r);
        assert_eq!(serde_json::to_string(&typed).unwrap(), legacy::results_3d(&r), "{what}");
        read += 1;
    }
    assert_eq!(read, fixtures(false, "results.json").len() + fixtures(true, "results.json").len());
    assert!(read >= 30, "only {read} stored results read");
}

fn every_2d_field() -> Value {
    json!({
        "displacements": [
            {"nodeId": 1, "ux": -0.0, "uz": 1e-17, "ry": 0.0},
            {"nodeId": 2, "ux": 0.001234, "uy": -0.5, "rz": -0.0}
        ],
        "reactions": [
            {"nodeId": 1, "rx": -0.0, "rz": 12.5, "my": -3.25},
            {"nodeId": 2, "rx": 1.0, "ry": 2.0, "mz": 0.0}
        ],
        "elementForces": [
            {"elementId": 1, "nStart": -0.0, "nEnd": 1.5, "vStart": 2.5, "vEnd": -2.5, "mStart": 0.0, "mEnd": -0.0,
             "length": 3.14159, "qI": -5.0, "qJ": -0.0,
             "pointLoads": [{"a": 1.1, "p": -4.4}, {"a": 0.4, "p": 3.0, "px": -0.0, "mz": 1.9}],
             "distributedLoads": [{"qI": -5.0, "qJ": -2.0, "a": 0.0, "b": 3.14159}],
             "distributedLoadsX": [{"qI": 1.0, "qJ": -0.0, "a": 0.5, "b": 1.0}],
             "hingeStart": true},
            {"elementId": 2, "nStart": 0, "nEnd": 0, "vStart": 0, "vEnd": 0, "mStart": 0, "mEnd": 0, "length": 1,
             "qI": 0, "qJ": 0, "pointLoads": [], "distributedLoads": []}
        ]
    })
}

fn every_3d_field() -> Value {
    json!({
        "displacements": [
            {"nodeId": 1, "ux": -0.0, "uy": 1e-17, "uz": 0.0, "rx": -0.0, "ry": 2e-4, "rz": 0.0},
            {"nodeId": 2, "ux": 0.1, "uy": 0.2, "uz": 0.3, "rx": 0.4, "ry": 0.5, "rz": -0.6, "warping": -0.0}
        ],
        "reactions": [
            {"nodeId": 1, "fx": -0.0, "fy": 1.0, "fz": 2.0, "mx": 3.0, "my": -0.0, "mz": 4.0},
            {"nodeId": 2, "fx": 0, "fy": 0, "fz": 0, "mx": 0, "my": 0, "mz": 0, "bimoment": 0.02}
        ],
        "elementForces": [
            {"elementId": 1, "length": 3.0, "nStart": -0.0, "nEnd": 1.0, "vyStart": 2.0, "vyEnd": -2.0, "vzStart": 0.5,
             "vzEnd": -0.0, "mxStart": 0.1, "mxEnd": -0.1, "myStart": 0.0, "myEnd": -0.0, "mzStart": 7.0, "mzEnd": -7.0,
             "releaseMzEnd": true, "releaseTStart": true,
             "qYI": -5.0, "qYJ": -2.5, "distributedLoadsY": [{"qI": -5.0, "qJ": -2.5, "a": 0.0, "b": 3.0}],
             "pointLoadsY": [{"a": 1.0, "p": -0.0}], "qZI": 0.0, "qZJ": 1.25, "distributedLoadsZ": [],
             "distributedLoadsX": [{"qI": 0.5, "qJ": 0.5, "a": 0.0, "b": 3.0}], "pointLoadsZ": [{"a": 2.0, "p": 3.0}],
             "bimomentStart": -0.0, "bimomentEnd": 0.01},
            {"elementId": 2, "length": 1.0, "nStart": 0, "nEnd": 0, "vyStart": 0, "vyEnd": 0, "vzStart": 0, "vzEnd": 0,
             "mxStart": 0, "mxEnd": 0, "myStart": 0, "myEnd": 0, "mzStart": 0, "mzEnd": 0, "qYI": 0, "qYJ": 0,
             "distributedLoadsY": [], "pointLoadsY": [], "qZI": 0, "qZJ": 0, "distributedLoadsZ": [], "pointLoadsZ": []}
        ]
    })
}

#[test]
fn units_results_keep_signed_zeros_aliases_and_absent_optionals() {
    let r: AnalysisResults = serde_json::from_value(every_2d_field()).unwrap();
    check_2d("every 2D field", &r);
    let text = serde_json::to_string(&r).unwrap();
    for needle in [r#""ux":-0.0"#, r#""ry":-0.0"#, r#""rx":-0.0"#, r#""px":-0.0"#, r#""my":1.9"#, r#""uz":-0.5"#] {
        assert!(text.contains(needle), "{needle} in {text}");
    }
    let typed = r.clone().into_typed();
    assert_eq!(typed.displacements[1].uz.in_m().to_bits(), (-0.5f64).to_bits());
    assert_eq!(typed.displacements[1].ry.in_rad().to_bits(), (-0.0f64).to_bits());
    assert_eq!(typed.reactions[1].rz.in_kn().to_bits(), 2.0f64.to_bits());
    assert_eq!(typed.element_forces[0].m_end.in_kn_m().to_bits(), (-0.0f64).to_bits());
    assert_eq!(typed.element_forces[0].point_loads[0].px, None);
    assert!(!text.contains(r#""distributedLoadsX":[]"#));
    let r: AnalysisResults3D = serde_json::from_value(every_3d_field()).unwrap();
    check_3d("every 3D field", &r);
    let text = serde_json::to_string(&r).unwrap();
    for needle in [r#""warping":-0.0"#, r#""bimomentStart":-0.0"#, r#""bimoment":0.02"#, r#""vzEnd":-0.0"#] {
        assert!(text.contains(needle), "{needle} in {text}");
    }
    assert!(!text.contains(r#""bimomentEnd":null"#) && !text.contains(r#""warping":null"#));
    let typed = r.into_typed();
    assert_eq!(typed.displacements[0].rx.in_rad().to_bits(), (-0.0f64).to_bits());
    assert_eq!(typed.reactions[1].bimoment.map(|b| b.in_kn_m2()), Some(0.02));
    assert_eq!(typed.element_forces[0].bimoment_start.map(|b| b.in_kn_m2().to_bits()), Some((-0.0f64).to_bits()));
    assert_eq!(typed.element_forces[1].bimoment_end, None);
}

fn err<T: serde::de::DeserializeOwned>(text: &str) -> Result<(), String> {
    serde_json::from_str::<T>(text).map(|_| ()).map_err(|e| e.to_string())
}

#[test]
fn units_malformed_result_records_give_the_same_message() {
    for text in [r#""x""#, "7", "[1, 2]", "{}", r#"{"nodeId": 1, "ux": "0"}"#, r#"{"elementId": 1, "length": null}"#] {
        assert_eq!(err::<TypedDisplacement>(text), err::<Displacement>(text), "{text}");
        assert_eq!(err::<TypedReaction>(text), err::<Reaction>(text), "{text}");
        assert_eq!(err::<TypedElementForces>(text), err::<ElementForces>(text), "{text}");
        assert_eq!(err::<TypedPointLoadInfo>(text), err::<PointLoadInfo>(text), "{text}");
        assert_eq!(err::<TypedDistributedLoadInfo>(text), err::<DistributedLoadInfo>(text), "{text}");
        assert_eq!(err::<TypedDisplacement3D>(text), err::<Displacement3D>(text), "{text}");
        assert_eq!(err::<TypedReaction3D>(text), err::<Reaction3D>(text), "{text}");
        assert_eq!(err::<TypedElementForces3D>(text), err::<ElementForces3D>(text), "{text}");
        assert_eq!(err::<TypedPointLoadInfo3D>(text), err::<PointLoadInfo3D>(text), "{text}");
    }
    for (field, bad) in [
        ("displacements", json!([{"nodeId": 1, "ux": 0, "uz": "0", "ry": 0}])),
        ("reactions", json!([{"nodeId": 1, "rx": 0, "rz": 0}])),
        ("elementForces", json!([{"elementId": 1}])),
    ] {
        let mut model = every_2d_field();
        model[field] = bad.clone();
        let text = model.to_string();
        assert_eq!(err::<TypedResults2D>(&text), err::<AnalysisResults>(&text), "2D {field}");
        assert!(err::<AnalysisResults>(&text).is_err());
        let mut model = every_3d_field();
        model[field] = bad;
        let text = model.to_string();
        assert_eq!(err::<TypedResults3D>(&text), err::<AnalysisResults3D>(&text), "3D {field}");
        assert!(err::<AnalysisResults3D>(&text).is_err());
    }
}

#[test]
fn units_the_solve_exports_serialize_the_typed_results() {
    let source = include_str!("../../src/lib.rs");
    for export in ["pub fn solve_2d(", "pub fn solve_3d(", "pub fn combine_results_2d(", "pub fn combine_results_3d("] {
        let body = &source[source.find(export).unwrap()..];
        let body = &body[..body.find("\n}\n").unwrap()];
        assert!(body.contains(".into_typed())"), "{export} does not serialize the typed results");
        assert!(!body.contains("to_js_value(&result)") && !body.contains("to_js_value(&results)"), "{export} also serializes untyped results");
    }
}

fn warping_cantilever() -> Value {
    json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "y": 0.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.00538, "iy": 8.36e-5, "iz": 6.04e-6, "j": 1.2e-7, "cw": 1.25e-7}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true, "rw": true}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0, "fy": 0, "fz": -1.0, "mx": 0.75, "my": 0, "mz": 0, "bw": -0.0}}]
    })
}

#[test]
fn units_the_warping_displacement_is_a_twist_rate_with_the_same_text() {
    let input = legacy_input::parse(&warping_cantilever().to_string()).unwrap();
    let r = solve_3d(&input).unwrap();
    check_3d("warping cantilever", &r);
    let free = r.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let w = free.warping.expect("a section with cw solves with a warping DOF");
    assert!(w != 0.0 && w.is_finite());
    let typed = r.clone().into_typed();
    let t = typed.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_eq!(t.warping.map(|w| w.in_rad_per_m().to_bits()), Some(w.to_bits()));
    let r: AnalysisResults3D = serde_json::from_value(every_3d_field()).unwrap();
    let typed = r.into_typed();
    assert_eq!(typed.displacements[1].warping.map(|w| w.in_rad_per_m().to_bits()), Some((-0.0f64).to_bits()));
    assert_eq!(typed.displacements[0].warping, None);
}

#[test]
fn units_combined_results_serialize_to_the_legacy_text() {
    use dedaliano_engine::postprocess::combinations::*;
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ex-3d-portal-frame-input.json")).unwrap();
    let a = solve_3d(&legacy_input::parse(&text).unwrap()).unwrap();
    let b = solve_3d(&legacy_input::parse(&warping_cantilever().to_string()).unwrap()).unwrap();
    for (case, other) in [(&a, &a), (&b, &b)] {
        let input = CombinationInput3D {
            factors: vec![CombinationFactor { case_id: 1, factor: 1.2 }, CombinationFactor { case_id: 2, factor: -0.5 }],
            cases: vec![CaseEntry3D { case_id: 1, results: case.clone() }, CaseEntry3D { case_id: 2, results: other.clone() }],
            plate_thicknesses: vec![],
        };
        let combined = combine_results_3d(&input).unwrap().unwrap();
        check_3d("combined 3D", &combined);
    }
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ex-portal-frame-input.json")).unwrap();
    let r = solve_2d(&serde_json::from_str(&text).unwrap()).unwrap();
    let input = CombinationInput {
        factors: vec![CombinationFactor { case_id: 1, factor: 1.4 }, CombinationFactor { case_id: 2, factor: -0.0 }],
        cases: vec![CaseEntry { case_id: 1, results: r.clone() }, CaseEntry { case_id: 2, results: r }],
    };
    check_2d("combined 2D", &combine_results_checked(&input).unwrap().unwrap());
}
