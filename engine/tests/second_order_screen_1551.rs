use dedaliano_engine::known_issues::SECOND_ORDER_RATIO;
use dedaliano_engine::postprocess::combinations::{combine_results_refs, CombinationFactor};
use dedaliano_engine::solver::buckling::solve_buckling_2d;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::types::*;
use serde_json::json;
use std::f64::consts::PI;

const E: f64 = 200_000.0;
const IPN300_WEAK: f64 = 4.51e-6;
const IPN300_STRONG: f64 = 9.8e-5;
const L: f64 = 3.0;

fn second_order(d: &[StructuredDiagnostic]) -> Vec<(String, Vec<usize>)> {
    d.iter()
        .filter(|d| d.code == DiagnosticCode::KnownIssue && d.phase.as_deref().is_some_and(|p| p.starts_with("LIN-SECOND-ORDER")))
        .map(|d| (d.phase.clone().unwrap(), d.element_ids.clone()))
        .collect()
}

fn warned(ids: Vec<usize>) -> Vec<(String, Vec<usize>)> {
    vec![("LIN-SECOND-ORDER".to_string(), ids)]
}

fn cantilever_2d(segments: usize, fx: f64, e: f64, scale: f64) -> SolverInput {
    let nodes: serde_json::Map<_, _> = (0..=segments).map(|i| ((i + 1).to_string(), json!({"id": i + 1, "x": L * i as f64 / segments as f64, "z": 0.0}))).collect();
    let elements: serde_json::Map<_, _> = (1..=segments).map(|i| (i.to_string(), json!({"id": i, "type": "frame", "nodeI": i, "nodeJ": i + 1, "materialId": 1, "sectionId": 1}))).collect();
    serde_json::from_value(json!({
        "nodes": nodes,
        "materials": {"1": {"id": 1, "e": e, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 6.9e-3, "iz": IPN300_WEAK}},
        "elements": elements,
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
        "loads": [{"type": "nodal", "data": {"nodeId": segments + 1, "fx": fx * scale, "fz": -10.0 * scale, "my": 0.0}}],
    }))
    .unwrap()
}

fn rotate(r: &[[f64; 3]; 3], v: [f64; 3]) -> [f64; 3] {
    [0, 1, 2].map(|i| r[i][0] * v[0] + r[i][1] * v[1] + r[i][2] * v[2])
}

/// #1551's cantilever, IPN 300 along x, carried by a rigid motion `r` then `t`.
fn cantilever_3d(segments: usize, fx: f64, e: f64, scale: f64, r: [[f64; 3]; 3], t: [f64; 3]) -> SolverInput3D {
    let at = |x: f64| { let p = rotate(&r, [x, 0.0, 0.0]); [p[0] + t[0], p[1] + t[1], p[2] + t[2]] };
    let nodes: serde_json::Map<_, _> = (0..=segments).map(|i| { let p = at(L * i as f64 / segments as f64); ((i + 1).to_string(), json!({"id": i + 1, "x": p[0], "y": p[1], "z": p[2]})) }).collect();
    let elements: serde_json::Map<_, _> = (1..=segments).map(|i| (i.to_string(), json!({"id": i, "type": "frame", "nodeI": i, "nodeJ": i + 1, "materialId": 1, "sectionId": 1}))).collect();
    let f = rotate(&r, [fx * scale, 1.0 * scale, -10.0 * scale]);
    let m = rotate(&r, [0.5 * scale, 0.0, 0.0]);
    serde_json::from_value(json!({
        "nodes": nodes,
        "materials": {"1": {"id": 1, "e": e, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 6.9e-3, "iy": IPN300_STRONG, "iz": IPN300_WEAK, "j": 5.69e-7}},
        "elements": elements,
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
        "loads": [{"type": "nodal", "data": {"nodeId": segments + 1, "fx": f[0], "fy": f[1], "fz": f[2], "mx": m[0], "my": m[1], "mz": m[2]}}],
    }))
    .unwrap()
}

const IDENTITY: [[f64; 3]; 3] = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];

fn oblique() -> [[f64; 3]; 3] {
    let (a, b) = (0.7_f64, -0.4_f64);
    let rz = [[a.cos(), -a.sin(), 0.0], [a.sin(), a.cos(), 0.0], [0.0, 0.0, 1.0]];
    let ry = [[b.cos(), 0.0, b.sin()], [0.0, 1.0, 0.0], [-b.sin(), 0.0, b.cos()]];
    [0, 1, 2].map(|i| [0, 1, 2].map(|j| (0..3).map(|k| rz[i][k] * ry[k][j]).sum()))
}

/// N/Ncr of #1551's cantilever, Ncr = π²·E·I_weak/(2L)² with E in kN/m².
fn cantilever_ratio(n: f64) -> f64 {
    n / (PI * PI * E * 1000.0 * IPN300_WEAK / (2.0 * L).powi(2))
}

#[test]
fn the_1551_cantilever_warns_in_2d_and_3d_and_the_lighter_one_does_not() {
    assert!(cantilever_ratio(100.0) > 0.4 && cantilever_ratio(10.0) < SECOND_ORDER_RATIO);
    let heavy = solve_2d(&cantilever_2d(1, -100.0, E, 1.0)).unwrap();
    assert_eq!(second_order(&heavy.structured_diagnostics), warned(vec![1]));
    let light = solve_2d(&cantilever_2d(1, -10.0, E, 1.0)).unwrap();
    assert_eq!(second_order(&light.structured_diagnostics), vec![]);
    let heavy = solve_3d(&cantilever_3d(1, -100.0, E, 1.0, IDENTITY, [0.0; 3])).unwrap();
    assert!((heavy.element_forces[0].n_start + 100.0).abs() < 1e-6, "{:?}", heavy.element_forces[0]);
    assert_eq!(second_order(&heavy.structured_diagnostics), warned(vec![1]));
    let light = solve_3d(&cantilever_3d(1, -10.0, E, 1.0, IDENTITY, [0.0; 3])).unwrap();
    assert_eq!(second_order(&light.structured_diagnostics), vec![]);
}

#[test]
fn the_cantilever_warning_survives_subdivision_rigid_motion_and_load_scale() {
    for (segments, scale, r, t) in [(4, 1.0, IDENTITY, [0.0; 3]), (1, 1.0, oblique(), [120.0, -35.0, 7.5]), (6, 1.0, oblique(), [-3.0, 0.0, 40.0]), (1, 1000.0, IDENTITY, [0.0; 3]), (3, 1e-3, oblique(), [1.0, 2.0, 3.0])] {
        let label = format!("{segments} segments, loads and E ×{scale}, rotation {r:?}, translation {t:?}");
        let ids: Vec<usize> = (1..=segments).collect();
        let heavy = solve_3d(&cantilever_3d(segments, -100.0, E * scale, scale, r, t)).unwrap();
        assert_eq!(second_order(&heavy.structured_diagnostics), warned(ids.clone()), "3D {label}");
        let light = solve_3d(&cantilever_3d(segments, -10.0, E * scale, scale, r, t)).unwrap();
        assert_eq!(second_order(&light.structured_diagnostics), vec![], "3D {label}");
        let heavy = solve_2d(&cantilever_2d(segments, -100.0, E * scale, scale)).unwrap();
        assert_eq!(second_order(&heavy.structured_diagnostics), warned(ids), "2D {label}");
        let light = solve_2d(&cantilever_2d(segments, -10.0, E * scale, scale)).unwrap();
        assert_eq!(second_order(&light.structured_diagnostics), vec![], "2D {label}");
    }
}

/// A portal of 4 m columns (I = 1e-4 m⁴) and a 4 m beam a tenth as stiff, both columns loaded by
/// `p` at the head and pushed sideways by p/100.
fn portal(base: &str, p: f64) -> SolverInput {
    serde_json::from_value(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "z": 4.0}, "3": {"id": 3, "x": 4.0, "z": 4.0}, "4": {"id": 4, "x": 4.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": E, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}, "2": {"id": 2, "a": 0.01, "iz": 1e-5}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 2},
            "3": {"id": 3, "type": "frame", "nodeI": 4, "nodeJ": 3, "materialId": 1, "sectionId": 1},
        },
        "supports": {"1": {"id": 1, "nodeId": 1, "type": base}, "2": {"id": 2, "nodeId": 4, "type": base}},
        "loads": [
            {"type": "nodal", "data": {"nodeId": 2, "fx": p / 100.0, "fz": -p, "my": 0.0}},
            {"type": "nodal", "data": {"nodeId": 3, "fx": 0.0, "fz": -p, "my": 0.0}},
        ],
    }))
    .unwrap()
}

#[test]
fn a_pinned_base_sway_portal_warns_where_the_cantilever_bound_would_not() {
    let cantilever_ncr = PI * PI * E * 1000.0 * 1e-4 / (2.0 * 4.0_f64).powi(2);
    let p = 0.07 * cantilever_ncr;
    let pinned = solve_2d(&portal("pinned", p)).unwrap();
    let column_n = pinned.element_forces.iter().filter(|f| f.element_id != 2).map(|f| -f.n_start.min(f.n_end)).fold(0.0, f64::max);
    assert!(column_n / cantilever_ncr < SECOND_ORDER_RATIO, "the cantilever bound alone would stay quiet: N/Ncr = {}", column_n / cantilever_ncr);
    let factor = solve_buckling_2d(&portal("pinned", p), 1).unwrap().modes[0].load_factor;
    assert!(factor < 1.0 / SECOND_ORDER_RATIO, "the pinned portal's own critical factor {factor} is under the limit");
    assert_eq!(second_order(&pinned.structured_diagnostics), warned(vec![]));

    let fixed = solve_2d(&portal("fixed", p)).unwrap();
    let factor = solve_buckling_2d(&portal("fixed", p), 1).unwrap().modes[0].load_factor;
    assert!(factor > 1.0 / SECOND_ORDER_RATIO, "the fixed portal's critical factor {factor} is over the limit");
    assert_eq!(second_order(&fixed.structured_diagnostics), vec![]);
}

#[test]
fn a_combination_carries_the_second_order_warning_of_its_cases() {
    let heavy = solve_2d(&cantilever_2d(2, -100.0, E, 1.0)).unwrap();
    let light = solve_2d(&cantilever_2d(2, -10.0, E, 1.0)).unwrap();
    let combined = combine_results_refs(&[CombinationFactor { case_id: 1, factor: 1.2 }, CombinationFactor { case_id: 2, factor: 1.6 }], &[(1, &heavy), (2, &light)]).unwrap();
    assert_eq!(second_order(&combined.structured_diagnostics), warned(vec![1, 2]));
    let pinned = solve_2d(&portal("pinned", 250.0)).unwrap();
    let combined = combine_results_refs(&[CombinationFactor { case_id: 1, factor: 1.0 }, CombinationFactor { case_id: 2, factor: 1.0 }], &[(1, &heavy), (2, &pinned)]).unwrap();
    assert_eq!(second_order(&combined.structured_diagnostics), warned(vec![]));
}

#[test]
fn the_limit_keeps_the_worst_moment_amplification_within_ten_percent() {
    let sec = |rho: f64| 1.0 / (PI / 2.0 * rho.sqrt()).cos();
    assert!(sec(SECOND_ORDER_RATIO) <= 1.1 && sec(SECOND_ORDER_RATIO) > 1.0999, "{}", sec(SECOND_ORDER_RATIO));
    assert!(1.0 / (1.0 - SECOND_ORDER_RATIO) < 1.1);
}

/// A clamped cantilever squeezed between two opposed axial loads inside its span: both end forces
/// are zero and the middle third carries `p` in compression.
fn squeezed_cantilever(p: f64) -> SolverInput {
    serde_json::from_value(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": L, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": E, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 6.9e-3, "iz": IPN300_WEAK}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
        "loads": [
            {"type": "pointOnElement", "data": {"elementId": 1, "a": 1.0, "p": -1.0, "px": p}},
            {"type": "pointOnElement", "data": {"elementId": 1, "a": 2.0, "p": 0.0, "px": -p}},
        ],
    }))
    .unwrap()
}

#[test]
fn compression_from_span_loads_is_seen_though_both_ends_read_zero() {
    let r = solve_2d(&squeezed_cantilever(100.0)).unwrap();
    let f = &r.element_forces[0];
    assert!(f.n_start.abs() < 1e-6 && f.n_end.abs() < 1e-6, "{f:?}");
    assert_eq!(second_order(&r.structured_diagnostics), warned(vec![1]));
    let r = solve_2d(&squeezed_cantilever(5.0)).unwrap();
    assert_eq!(second_order(&r.structured_diagnostics), vec![]);
}

