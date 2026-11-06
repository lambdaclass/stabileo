use dedaliano_engine::solver::plastic;
use dedaliano_engine::types::*;
use serde_json::json;

fn s2(v: serde_json::Value) -> SolverInput {
    serde_json::from_value(v).unwrap()
}

fn close(a: f64, b: f64, rel: f64, what: &str) {
    assert!((a - b).abs() <= rel * a.abs().max(b.abs()).max(1e-300), "{what}: {a} vs {b}");
}

fn rect(a: f64, i: f64) -> (f64, f64) {
    let h = (12.0 * i / a).sqrt();
    (a / h, h)
}

fn settlement_beam() -> SolverInput {
    s2(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 4.0, "z": 0.0}, "3": {"id": 3, "x": 8.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1}
        },
        "supports": {
            "1": {"id": 1, "nodeId": 1, "type": "fixed"},
            "2": {"id": 2, "nodeId": 2, "type": "rollerX", "dz": -0.01},
            "3": {"id": 3, "nodeId": 3, "type": "rollerX"}
        },
        "loads": [{"type": "distributed", "data": {"elementId": 1, "qI": -5.0, "qJ": -5.0}}]
    }))
}

fn plastic_2d_input(s: &SolverInput) -> PlasticInput {
    let sections = s
        .sections
        .values()
        .map(|x| {
            let (b, h) = rect(x.a, x.iz);
            let mat = s.elements.values().find(|e| e.section_id == x.id).map_or(1, |e| e.material_id);
            (x.id.to_string(), PlasticSectionData { a: x.a, iz: x.iz, material_id: mat, b: Some(b), h: Some(h) })
        })
        .collect();
    let materials = s.materials.values().map(|x| (x.id.to_string(), PlasticMaterialData { fy: Some(250.0) })).collect();
    PlasticInput { solver: s.clone(), sections, materials, max_hinges: None, mp_overrides: None }
}

fn plastic_2d(s: &SolverInput) -> Result<plastic::PlasticResult, String> {
    plastic::solve_plastic_2d(&plastic_2d_input(s))
}

fn plastic_2d_unrefused(s: &SolverInput) -> Result<plastic::PlasticResult, String> {
    plastic::solve_plastic_2d_unrefused(&plastic_2d_input(s))
}

/// A symmetric fixed portal under a beam UDL collapses by the beam mechanism
/// with hinges at both column tops (the weaker sections) and midspan:
/// λ·qL²/8 = Mp_beam + Mp_column. Twin column hinges reached Mp ~1e-9 apart
/// and formed in separate events; the second never formed and the reported
/// factor was 15% too high.
#[test]
fn plastic_symmetric_portal_collapses_by_its_mechanism() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ex-frame-cirsoc-dl-case2-input.json")).unwrap();
    let s: SolverInput = serde_json::from_str(&text).unwrap();
    crate::common::assert_containment(plastic_2d(&s), "PL-2D-INVARIANCE");
    let r = plastic_2d_unrefused(&s).unwrap();
    // Mp = fy·b·h²/4: beam 0.2×0.5, columns 0.3×0.3, fy = 250 MPa; q = 5, L = 6.
    let (mp_b, mp_c) = (250e3 * 0.2 * 0.25 / 4.0, 250e3 * 0.3 * 0.09 / 4.0);
    let expected = (mp_b + mp_c) / (5.0 * 36.0 / 8.0);
    close(r.collapse_factor, expected, 1e-3, "collapse factor");
    assert!(r.warnings.is_empty(), "{:?}", r.warnings);
}

/// Plastic collapse refuses a model loaded only by imposed deformations, and
/// loads the structure carries without bending, instead of reporting a
/// factor of ~1e16.
#[test]
fn plastic_refuses_what_it_cannot_scale_to_collapse() {
    let mut s = settlement_beam();
    s.loads.clear();
    crate::common::assert_containment(plastic_2d(&s), "PL-2D-INVARIANCE");
    assert!(plastic_2d_unrefused(&s).is_err_and(|e| e.contains("mechanical load")));
    let arch = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ex-three-hinge-arch-input.json")).unwrap();
    let a: SolverInput = serde_json::from_str(&arch).unwrap();
    crate::common::assert_containment(plastic_2d(&a), "PL-2D-INVARIANCE");
    let r = plastic_2d_unrefused(&a);
    assert!(r.as_ref().is_err_and(|e| e.contains("without bending")), "{:?}", r.map(|r| r.collapse_factor));
}

#[test]
#[ignore]
fn probe_plastic_file() {
    let f = std::env::var("PFILE").unwrap();
    let s: SolverInput = serde_json::from_str(&std::fs::read_to_string(&f).unwrap()).unwrap();
    match plastic_2d_unrefused(&s) {
        Ok(r) => { println!("factor {} mech {} warn {:?}", r.collapse_factor, r.is_mechanism, r.warnings); for h in &r.hinges { println!("  {h:?}"); } }
        Err(e) => println!("err {e}"),
    }
}
