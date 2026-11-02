//! Open defects contained by a warning: the defect's own model, its result, and the warning on it.

use dedaliano_engine::certify::certify_linear_3d_full;
use dedaliano_engine::solver::corotational::solve_corotational_3d;
use dedaliano_engine::solver::linear::solve_3d;
use dedaliano_engine::types::*;

fn known(ds: &[StructuredDiagnostic]) -> Vec<String> {
    ds.iter().filter(|d| d.code == DiagnosticCode::KnownIssue).filter_map(|d| d.phase.clone()).collect()
}

/// Node 2 is held by the torsion of a member along (2, 1.3, 0) and of a member along Z; both
/// release bending there, so its rotation about (−1.3, 2, 0) is held by nothing. Every
/// diagonal of the rotation block is positive, and the axis is not exact in binary, so the
/// matrix is singular in exact arithmetic and regular after rounding (#458, second case).
fn skew_mechanism(moment: [f64; 3], released: bool) -> SolverInput3D {
    serde_json::from_value(serde_json::json!({
        "nodes": {"1": {"id":1,"x":0,"y":0,"z":0}, "2": {"id":2,"x":2,"y":1.3,"z":0}, "3": {"id":3,"x":2,"y":1.3,"z":-3}},
        "materials": {"1": {"id":1,"e":200000,"nu":0.3}},
        "sections": {"1": {"id":1,"a":0.01,"iy":0.0001,"iz":0.0001,"j":0.00005}},
        "elements": {
            "1": {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1,"releaseMyEnd":released,"releaseMzEnd":released},
            "2": {"id":2,"type":"frame","nodeI":3,"nodeJ":2,"materialId":1,"sectionId":1,"releaseMyEnd":true,"releaseMzEnd":true}
        },
        "supports": {
            "1": {"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true},
            "2": {"nodeId":3,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}
        },
        "loads": [{"type":"nodal","data":{"nodeId":2,"fx":0,"fy":0,"fz":-10,"mx":moment[0],"my":moment[1],"mz":moment[2]}}]
    })).unwrap()
}

#[test]
fn a_rotation_held_by_nothing_about_a_skew_axis_is_warned_and_not_certified() {
    for (what, moment) in [("about the free axis", [-1.3, 2.0, 0.0]), ("about the torsion axis", [2.0, 1.3, 0.0]), ("none", [0.0; 3])] {
        let input = skew_mechanism(moment, true);
        let result = solve_3d(&input).unwrap_or_else(|e| panic!("{what}: {e}"));
        let codes: Vec<_> = result.structured_diagnostics.iter().map(|d| d.code).collect();
        assert!(codes.contains(&DiagnosticCode::StiffnessNotPositiveDefinite), "{what}: {codes:?}");
        assert!(known(&result.structured_diagnostics).contains(&"NUM-INVARIANCE".to_string()), "{what}");
        let certified = certify_linear_3d_full(&input).unwrap();
        assert!(!certified.certificate.is_certified(), "{what}: {:?}", certified.certificate);
        assert!(!certified.end_to_end.is_certified(), "{what}: {:?}", certified.end_to_end);
    }
    let free = solve_3d(&skew_mechanism([-1.3, 2.0, 0.0], true)).unwrap();
    let node = free.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(node.rx.abs().max(node.ry.abs()) > 1e6, "the free rotation is unbounded: {node:?}");

    let held = skew_mechanism([-1.3, 2.0, 0.0], false);
    let result = solve_3d(&held).unwrap();
    assert!(known(&result.structured_diagnostics).is_empty(), "{:?}", result.structured_diagnostics);
    assert!(certify_linear_3d_full(&held).unwrap().certificate.is_certified());
}

/// Bathe and Bolourchi's 45° bend (R = 100, unit square section, E = 10⁷, ν = 0) under an
/// out-of-plane tip load of 600: tip displacement (−23.5, −13.4, 53.4) (Simo and Vu-Quoc 1986).
fn bathe_bolourchi(n: usize) -> SolverInput3D {
    let r = 100.0f64;
    let mut nodes = serde_json::Map::new();
    let mut elements = serde_json::Map::new();
    for i in 0..=n {
        let a = std::f64::consts::FRAC_PI_4 * i as f64 / n as f64;
        nodes.insert((i + 1).to_string(), serde_json::json!({"id": i + 1, "x": r * a.sin(), "y": r * (1.0 - a.cos()), "z": 0.0}));
        if i > 0 {
            elements.insert(i.to_string(), serde_json::json!({"id": i, "type": "frame", "nodeI": i, "nodeJ": i + 1, "materialId": 1, "sectionId": 1}));
        }
    }
    serde_json::from_value(serde_json::json!({
        "nodes": nodes, "elements": elements,
        "materials": {"1": {"id": 1, "e": 1.0e4, "nu": 0.0}},
        "sections": {"1": {"id": 1, "a": 1.0, "iy": 1.0 / 12.0, "iz": 1.0 / 12.0, "j": 1.0 / 6.0}},
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
        "loads": [{"type": "nodal", "data": {"nodeId": n + 1, "fx": 0, "fy": 0, "fz": 600.0, "mx": 0, "my": 0, "mz": 0}}]
    })).unwrap()
}

#[test]
fn the_45_degree_bend_is_within_two_percent_and_carries_nl3() {
    let r = solve_corotational_3d(&bathe_bolourchi(8), 100, 1e-8, 60, false).unwrap();
    assert!(r.converged);
    let tip = r.results.displacements.iter().find(|d| d.node_id == 9).unwrap();
    let reference = [-23.5, -13.4, 53.4];
    let error = ((tip.ux - reference[0]).powi(2) + (tip.uy - reference[1]).powi(2) + (tip.uz - reference[2]).powi(2)).sqrt();
    let size = (reference[0] * reference[0] + reference[1] * reference[1] + reference[2] * reference[2]).sqrt();
    assert!(error / size < 0.02, "tip ({}, {}, {}), relative error {}", tip.ux, tip.uy, tip.uz, error / size);
    assert!((tip.uz / reference[2] - 1.0).abs() < 0.005, "{}", tip.uz);
    assert!(known(&r.results.structured_diagnostics).contains(&"NL-3".to_string()));
}

/// A cantilever along X with EI = GJ under a tip moment of fixed direction (cos α, 0, sin α)
/// bends into a helix about that direction, curvature and torsion in the ratio tan α: the
/// non-coaxial rotations NL-3 is about. Returns the model and the exact tip position.
fn helix(n: usize, alpha: f64, kl: f64) -> (SolverInput3D, [f64; 3]) {
    let (l, ei) = (10.0f64, 1.0e7 / 12.0);
    let k = kl / l;
    let mut nodes = serde_json::Map::new();
    let mut elements = serde_json::Map::new();
    for i in 0..=n {
        nodes.insert((i + 1).to_string(), serde_json::json!({"id": i + 1, "x": l * i as f64 / n as f64, "y": 0.0, "z": 0.0}));
        if i > 0 {
            elements.insert(i.to_string(), serde_json::json!({"id": i, "type": "frame", "nodeI": i, "nodeJ": i + 1, "materialId": 1, "sectionId": 1}));
        }
    }
    let (c, s) = (alpha.cos(), alpha.sin());
    let input = serde_json::from_value(serde_json::json!({
        "nodes": nodes, "elements": elements,
        "materials": {"1": {"id": 1, "e": 1.0e4, "nu": 0.0}},
        "sections": {"1": {"id": 1, "a": 1.0, "iy": 1.0 / 12.0, "iz": 1.0 / 12.0, "j": 1.0 / 6.0}},
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
        "loads": [{"type": "nodal", "data": {"nodeId": n + 1, "fx": 0, "fy": 0, "fz": 0, "mx": k * ei * c, "my": 0, "mz": k * ei * s}}]
    })).unwrap();
    let tip = [c * c * l + s * s * kl.sin() / k, s * (1.0 - kl.cos()) / k, c * s * l - s * c * kl.sin() / k];
    (input, tip)
}

#[test]
fn a_helix_from_a_non_coaxial_tip_moment_matches_the_exact_solution_and_carries_nl3() {
    let (input, exact) = helix(40, std::f64::consts::FRAC_PI_4, std::f64::consts::FRAC_PI_2);
    let r = solve_corotational_3d(&input, 100, 1e-9, 40, false).unwrap();
    assert!(r.converged);
    let tip = r.results.displacements.iter().find(|d| d.node_id == 41).unwrap();
    let got = [10.0 + tip.ux, tip.uy, tip.uz];
    let error = (0..3).map(|i| (got[i] - exact[i]).powi(2)).sum::<f64>().sqrt();
    assert!(error / 10.0 < 1e-4, "tip {got:?} vs exact {exact:?}, error {}", error / 10.0);
    assert!(known(&r.results.structured_diagnostics).contains(&"NL-3".to_string()));
}

#[test]
fn a_helix_beyond_the_increments_reach_is_reported_unconverged_not_wrong() {
    let (input, _) = helix(20, std::f64::consts::FRAC_PI_4, std::f64::consts::PI);
    let r = solve_corotational_3d(&input, 30, 1e-9, 20, false).unwrap();
    assert!(!r.converged);
    assert!(r.load_factor < 1.0, "{}", r.load_factor);
    assert!(known(&r.results.structured_diagnostics).contains(&"NL-3".to_string()));
}
