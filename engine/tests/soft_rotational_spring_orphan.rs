use dedaliano_engine::certify::{certify_linear_2d_full, certify_linear_3d_full, Certificate};
use dedaliano_engine::types::*;
use serde_json::json;

const M: f64 = 0.005;

fn issue_1437_model(kz: f64, constrained: bool) -> SolverInput {
    let mut v = json!({
        "nodes": {"1": {"id": 1, "x": 0, "z": 0}, "2": {"id": 2, "x": 3, "z": 0}},
        "materials": {"1": {"id": 1, "e": 200000, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 0.0001}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1, "hingeEnd": true}},
        "supports": {
            "1": {"id": 1, "nodeId": 1, "type": "fixed"},
            "2": {"id": 2, "nodeId": 2, "type": "spring", "kz": kz}
        },
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0, "fz": 0, "my": M}}]
    });
    if constrained {
        v["nodes"]["3"] = json!({"id": 3, "x": 3, "z": 3});
        v["elements"]["2"] = json!({"id": 2, "type": "frame", "nodeI": 1, "nodeJ": 3, "materialId": 1, "sectionId": 1});
        v["constraints"] = json!([{"type": "equalDOF", "masterNode": 3, "slaveNode": 2, "dofs": [0, 1]}]);
    }
    serde_json::from_value(v).unwrap()
}

fn assert_certified_exact_2d(kz: f64, constrained: bool) {
    let exact = M / kz;
    let out = certify_linear_2d_full(&issue_1437_model(kz, constrained))
        .unwrap_or_else(|e| panic!("kz={kz:e} constrained={constrained}: refused: {e}"));
    let ry = out.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ry;
    assert!(matches!(out.certificate, Certificate::Certified { .. }), "kz={kz:e} constrained={constrained}: {:?}", out.certificate);
    assert!((ry - exact).abs() <= 1e-9 * exact, "kz={kz:e} constrained={constrained}: certified ry(2) = {ry}, exact M/k = {exact}");
}

#[test]
fn tiny_rotational_spring_at_a_hinged_node_solves_exactly_2d() {
    assert_certified_exact_2d(1e-13, false);
}

#[test]
fn tiny_rotational_spring_at_a_hinged_node_is_uncertified_2d_constrained() {
    let exact = M / 1e-13;
    let out = certify_linear_2d_full(&issue_1437_model(1e-13, true)).unwrap();
    let ry = out.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ry;
    match &out.certificate {
        Certificate::Uncertified { reason } => assert!(reason.contains("positive definiteness"), "{reason}"),
        c => panic!("expected the reduced system to stay uncertified, got {c:?} with ry(2) = {ry}"),
    }
    assert!((ry - exact).abs() <= 1e-6 * exact, "ry(2) = {ry}, exact M/k = {exact}");
}

#[test]
fn soft_but_resolvable_rotational_spring_still_solves_exactly_2d() {
    assert_certified_exact_2d(1e-6, false);
    assert_certified_exact_2d(1e-6, true);
}

#[test]
fn soft_rotational_spring_tied_to_a_stiff_cantilever_is_not_replaced_2d() {
    let mut input = issue_1437_model(1e-6, true);
    input.sections.insert("2".into(), SolverSection { id: 2, a: 1.0, iz: 1.0, as_y: None });
    input.elements.get_mut("2").unwrap().section_id = 2;
    let exact = M / 1e-6;
    let out = certify_linear_2d_full(&input).unwrap();
    let ry = out.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ry;
    assert!(matches!(out.certificate, Certificate::Certified { .. }), "{:?}", out.certificate);
    assert!((ry - exact).abs() <= 1e-9 * exact, "certified ry(2) = {ry}, exact M/k = {exact}");
}

#[test]
fn tiny_rotational_spring_beside_stiff_ones_at_a_released_node_3d() {
    let k = [1.0, 1.0, 1e-13];
    let v = json!({
        "nodes": {"1": {"id": 1, "x": 0, "y": 0, "z": 0}, "2": {"id": 2, "x": 3, "y": 0, "z": 0}},
        "materials": {"1": {"id": 1, "e": 200000, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 0.0001, "iz": 0.0001, "j": 0.0001}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1,
            "releaseMyEnd": true, "releaseMzEnd": true, "releaseTEnd": true}},
        "supports": {
            "1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true},
            "2": {"nodeId": 2, "rx": false, "ry": false, "rz": false, "rrx": false, "rry": false, "rrz": false,
                  "krx": k[0], "kry": k[1], "krz": k[2]}
        },
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0, "fy": 0, "fz": 0, "mx": M, "my": M, "mz": M}}]
    });
    let input: SolverInput3D = serde_json::from_value(v).unwrap();
    let out = certify_linear_3d_full(&input).unwrap();
    assert!(matches!(out.certificate, Certificate::Certified { .. }), "{:?}", out.certificate);
    let d = out.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    for (rotation, stiffness) in [d.rx, d.ry, d.rz].into_iter().zip(k) {
        let exact = M / stiffness;
        assert!((rotation - exact).abs() <= 1e-9 * exact, "rotation {rotation}, exact M/k = {exact}");
    }
}
