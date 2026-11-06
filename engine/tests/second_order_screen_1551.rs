use dedaliano_engine::known_issues::{SECOND_ORDER_NEAR_FACTOR, SECOND_ORDER_RATIO, TRUSS_ALPHA_CR};
use dedaliano_engine::postprocess::combinations::{combine_results_3d_refs, combine_results_refs, CombinationFactor};
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

fn near(ids: Vec<usize>) -> Vec<(String, Vec<usize>)> {
    vec![("LIN-SECOND-ORDER-NEAR".to_string(), ids)]
}

fn unbounded() -> Vec<(String, Vec<usize>)> {
    vec![("LIN-SECOND-ORDER-UNBOUNDED".to_string(), vec![])]
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
    assert!(cantilever_ratio(100.0) > 0.4 && cantilever_ratio(10.0) * SECOND_ORDER_NEAR_FACTOR < SECOND_ORDER_RATIO);
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
    for (segments, scale, r, t) in [(4, 1.0, IDENTITY, [0.0; 3]), (1, 1.0, oblique(), [120.0, -35.0, 7.5]), (6, 1.0, oblique(), [-3.0, 0.0, 40.0]), (1, 1000.0, IDENTITY, [0.0; 3]), (3, 1e-3, oblique(), [1.0, 2.0, 3.0]), (2, 1e-9, IDENTITY, [0.0; 3]), (2, 1e9, oblique(), [0.0; 3])] {
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
/// `p` at the head and the left head pushed sideways by `push`·p.
fn portal(base: &str, p: f64, push: f64) -> SolverInput {
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
            {"type": "nodal", "data": {"nodeId": 2, "fx": push * p, "fz": -p, "my": 0.0}},
            {"type": "nodal", "data": {"nodeId": 3, "fx": 0.0, "fz": -p, "my": 0.0}},
        ],
    }))
    .unwrap()
}

#[test]
fn a_pinned_base_sway_portal_is_flagged_where_the_cantilever_bound_would_not() {
    let cantilever_ncr = PI * PI * E * 1000.0 * 1e-4 / (2.0 * 4.0_f64).powi(2);
    let p = 0.07 * cantilever_ncr;
    let pinned = solve_2d(&portal("pinned", p, 0.01)).unwrap();
    let column_n = pinned.element_forces.iter().filter(|f| f.element_id != 2).map(|f| -f.n_start.min(f.n_end)).fold(0.0, f64::max);
    assert!(column_n / cantilever_ncr < SECOND_ORDER_RATIO, "the cantilever bound alone would stay quiet: N/Ncr = {}", column_n / cantilever_ncr);
    let factor = solve_buckling_2d(&portal("pinned", p, 0.01), 1).unwrap().modes[0].load_factor;
    assert!(factor < 1.0 / SECOND_ORDER_RATIO, "the pinned portal's own critical factor {factor} is under the limit");
    assert_eq!(second_order(&pinned.structured_diagnostics), unbounded());
    let pinned = solve_2d(&portal("pinned", p, 0.0)).unwrap();
    assert_eq!(second_order(&pinned.structured_diagnostics), unbounded());

    let fixed = solve_2d(&portal("fixed", p, 0.0)).unwrap();
    let factor = solve_buckling_2d(&portal("fixed", p, 0.0), 1).unwrap().modes[0].load_factor;
    assert!(factor > 1.0 / SECOND_ORDER_RATIO, "the fixed portal's critical factor {factor} is over the limit");
    assert_eq!(second_order(&fixed.structured_diagnostics), near(vec![1, 3]));
    let fixed = solve_2d(&portal("fixed", p / SECOND_ORDER_NEAR_FACTOR, 0.0)).unwrap();
    assert_eq!(second_order(&fixed.structured_diagnostics), vec![]);
    let fixed = solve_2d(&portal("fixed", p, 0.01)).unwrap();
    assert_eq!(second_order(&fixed.structured_diagnostics), [near(vec![1, 3]), unbounded()].concat(), "the pushed beam is compressed and held by neither support");
}

/// A 6 m member along x on supports holding translation at both ends, pushed toward the start by
/// `p` at its midpoint, so its first half carries p/2 in compression, and sideways by p/100; `far`
/// is the support type at x = 6 m.
fn braced_2d(p: f64, far: &str) -> SolverInput {
    serde_json::from_value(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "z": 0.0}, "3": {"id": 3, "x": 6.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": E, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 6.9e-3, "iz": IPN300_WEAK}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1},
        },
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "pinned"}, "2": {"id": 2, "nodeId": 3, "type": far}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": -p, "fz": -p / 100.0, "my": 0.0}}],
    }))
    .unwrap()
}

fn braced_3d(p: f64) -> SolverInput3D {
    serde_json::from_value(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "y": 0.0, "z": 0.0}, "3": {"id": 3, "x": 6.0, "y": 0.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": E, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 6.9e-3, "iy": IPN300_STRONG, "iz": IPN300_WEAK, "j": 5.69e-7}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1},
        },
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": false, "rrz": false}, "2": {"nodeId": 3, "rx": true, "ry": true, "rz": true, "rrx": false, "rry": false, "rrz": false}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": -p, "fy": p / 100.0, "fz": -p / 100.0, "mx": 0.0, "my": 0.0, "mz": 0.0}}],
    }))
    .unwrap()
}

#[test]
fn a_member_braced_at_both_ends_is_judged_on_its_whole_length() {
    let ncr = PI * PI * E * 1000.0 * IPN300_WEAK / 6.0_f64.powi(2);
    let quiet = 0.06 * ncr;
    assert!(quiet / 2.0 / (ncr / 4.0) > SECOND_ORDER_RATIO, "the cantilever bound would flag it");
    let loud = 0.2 * ncr;
    let r = solve_2d(&braced_2d(quiet, "pinned")).unwrap();
    assert!((r.element_forces[0].n_start + quiet / 2.0).abs() < 1e-6 * quiet, "{:?}", r.element_forces[0]);
    assert_eq!(second_order(&solve_2d(&braced_2d(quiet, "pinned")).unwrap().structured_diagnostics), vec![]);
    assert_eq!(second_order(&solve_2d(&braced_2d(loud, "pinned")).unwrap().structured_diagnostics), warned(vec![1, 2]));
    assert_eq!(second_order(&solve_3d(&braced_3d(quiet)).unwrap().structured_diagnostics), vec![]);
    assert_eq!(second_order(&solve_3d(&braced_3d(loud)).unwrap().structured_diagnostics), warned(vec![1, 2]));
    assert_eq!(second_order(&solve_2d(&braced_2d(quiet, "rollerX")).unwrap().structured_diagnostics), unbounded(), "a roller does not hold the far end along the member");
}

#[test]
fn a_combination_is_bounded_by_its_factored_case_ratios() {
    let heavy = solve_2d(&cantilever_2d(2, -100.0, E, 1.0)).unwrap();
    let light = solve_2d(&cantilever_2d(2, -10.0, E, 1.0)).unwrap();
    let close = solve_2d(&cantilever_2d(2, -15.0, E, 1.0)).unwrap();
    assert_eq!(second_order(&light.structured_diagnostics), vec![]);
    assert_eq!(second_order(&close.structured_diagnostics), near(vec![1, 2]));
    let combine = |factors: &[(usize, f64)], cases: &[(usize, &AnalysisResults)]| {
        let factors: Vec<_> = factors.iter().map(|&(case_id, factor)| CombinationFactor { case_id, factor }).collect();
        second_order(&combine_results_refs(&factors, cases).unwrap().structured_diagnostics)
    };
    let whole = || warned(vec![]);
    assert_eq!(combine(&[(1, 1.2), (2, 1.6)], &[(1, &light), (2, &light)]), whole(), "1.2·0.040 + 1.6·0.040 = 0.113: two quiet cases pass the limit together");
    assert_eq!(combine(&[(1, 1.9)], &[(1, &light)]), whole(), "a single factor above 1.6 on a quiet case");
    assert_eq!(combine(&[(1, 1.0), (2, 0.5)], &[(1, &light), (2, &light)]), vec![], "0.061 stays under the limit");
    assert_eq!(combine(&[(1, 1.2), (2, 1.6)], &[(1, &light), (2, &close)]), whole());
    assert_eq!(combine(&[(1, 1.2), (2, 0.0)], &[(1, &light), (2, &close)]), vec![], "a case the combination leaves out adds nothing");
    assert_eq!(combine(&[(1, 0.9)], &[(1, &heavy)]), whole());
    let pulled = solve_2d(&cantilever_2d(2, 10.0, E, 1.0)).unwrap();
    assert_eq!(second_order(&pulled.structured_diagnostics), vec![]);
    let reversed = combine_results_refs(&[CombinationFactor { case_id: 1, factor: -1.0 }], &[(1, &pulled)]).unwrap();
    assert!(reversed.element_forces.iter().all(|f| f.n_start < -9.0), "{:?}", reversed.element_forces);
    assert_eq!(second_order(&reversed.structured_diagnostics), unbounded(), "a negative factor turns tension into compression");
    let pinned = solve_2d(&portal("pinned", 250.0, 0.01)).unwrap();
    assert_eq!(combine(&[(1, 0.1), (2, 1.0)], &[(1, &light), (2, &pinned)]), unbounded());
    let mut unscreened = light.clone();
    unscreened.result_summary = None;
    assert_eq!(combine(&[(1, 1.0)], &[(1, &unscreened)]), unbounded(), "a compressed case without a screened ratio");
    let first = combine_results_refs(&[CombinationFactor { case_id: 1, factor: 1.0 }, CombinationFactor { case_id: 2, factor: 0.5 }], &[(1, &light), (2, &light)]).unwrap();
    assert_eq!(combine(&[(1, 1.3)], &[(1, &first)]), whole(), "a combination of a combination keeps the bound");
    let light = solve_3d(&cantilever_3d(2, -10.0, E, 1.0, IDENTITY, [0.0; 3])).unwrap();
    assert_eq!(second_order(&light.structured_diagnostics), vec![]);
    let factors = [CombinationFactor { case_id: 1, factor: 1.2 }, CombinationFactor { case_id: 2, factor: 1.6 }];
    let combined = combine_results_3d_refs(&factors, &[(1, &light), (2, &light)]).unwrap().unwrap();
    assert_eq!(second_order(&combined.structured_diagnostics), whole(), "3D: 1.2·0.040 + 1.6·0.040");
    let factors = [CombinationFactor { case_id: 1, factor: 1.0 }, CombinationFactor { case_id: 2, factor: 0.5 }];
    let combined = combine_results_3d_refs(&factors, &[(1, &light), (2, &light)]).unwrap().unwrap();
    assert_eq!(second_order(&combined.structured_diagnostics), vec![]);
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


/// Two truss bars from pinned bases to an apex at node 3, tied sideways by a frame clamped at
/// node 4; `settled` pins the apex and pushes it down instead of loading it. Bar 1 has `iz1`.
fn truss_v(settled: bool, iz1: f64) -> SolverInput {
    let mut supports = json!({"1": {"id": 1, "nodeId": 1, "type": "pinned"}, "2": {"id": 2, "nodeId": 2, "type": "pinned"}, "4": {"id": 4, "nodeId": 4, "type": "fixed"}});
    let mut loads = vec![];
    if settled {
        supports["3"] = json!({"id": 3, "nodeId": 3, "type": "pinned", "dz": -0.001});
    } else {
        loads.push(json!({"type": "nodal", "data": {"nodeId": 3, "fx": 0.0, "fz": -10.0, "my": 0.0}}));
    }
    serde_json::from_value(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "z": 0.0}, "3": {"id": 3, "x": 1.5, "z": 2.0}, "4": {"id": 4, "x": 3.5, "z": 2.0}},
        "materials": {"1": {"id": 1, "e": E, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 1e-3, "iz": 1e-6}, "2": {"id": 2, "a": 1e-3, "iz": iz1}},
        "elements": {
            "1": {"id": 1, "type": "truss", "nodeI": 1, "nodeJ": 3, "materialId": 1, "sectionId": 2},
            "2": {"id": 2, "type": "truss", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1},
            "3": {"id": 3, "type": "frame", "nodeI": 3, "nodeJ": 4, "materialId": 1, "sectionId": 1},
        },
        "supports": supports,
        "loads": loads,
    }))
    .unwrap()
}

/// N/N_E of truss_v's bar `id` on its own length, 2.5 m.
fn truss_v_ratio(r: &AnalysisResults, id: usize, iz: f64) -> f64 {
    -r.element_forces.iter().find(|f| f.element_id == id).unwrap().n_start / (PI * PI * E * 1000.0 * iz / 2.5_f64.powi(2))
}

#[test]
fn a_compressed_truss_bar_in_a_stiff_structure_is_bounded_on_its_own_length() {
    let loaded = solve_2d(&truss_v(false, 1e-6)).unwrap();
    assert!(loaded.element_forces.iter().filter(|f| f.element_id != 3).all(|f| f.n_start < -1.0), "{:?}", loaded.element_forces);
    assert!(truss_v_ratio(&loaded, 1, 1e-6) < SECOND_ORDER_RATIO / SECOND_ORDER_NEAR_FACTOR);
    assert!(solve_buckling_2d(&truss_v(false, 1e-6), 1).unwrap().modes[0].load_factor >= TRUSS_ALPHA_CR);
    assert_eq!(second_order(&loaded.structured_diagnostics), vec![]);
    let settled = solve_2d(&truss_v(true, 1e-6)).unwrap();
    assert!(settled.element_forces.iter().filter(|f| f.element_id != 3).all(|f| f.n_start < -1.0), "{:?}", settled.element_forces);
    assert_eq!(second_order(&settled.structured_diagnostics), vec![]);
}

#[test]
fn a_slender_truss_bar_holds_only_itself_while_the_structure_stays_stiff() {
    let slender = 2e-9;
    let input = truss_v(false, slender);
    let r = solve_2d(&input).unwrap();
    assert!(truss_v_ratio(&r, 1, slender) > SECOND_ORDER_RATIO, "{}", truss_v_ratio(&r, 1, slender));
    assert!(truss_v_ratio(&r, 2, 1e-6) < SECOND_ORDER_RATIO / SECOND_ORDER_NEAR_FACTOR);
    let alpha = solve_buckling_2d(&input, 1).unwrap().modes[0].load_factor;
    assert!(alpha >= TRUSS_ALPHA_CR, "α_cr {alpha}");
    assert_eq!(second_order(&r.structured_diagnostics), warned(vec![1]));
    let screen = r.result_summary.as_ref().and_then(|s| s.truss_screen.clone()).unwrap();
    assert!((screen.sway.unwrap() - 1.0 / alpha).abs() <= 1e-9 / alpha, "{screen:?}");
    assert_eq!(screen.bars.iter().map(|b| b.element_id).collect::<Vec<_>>(), vec![1, 2]);
    assert!((screen.bars[0].ratio - truss_v_ratio(&r, 1, slender)).abs() <= 1e-9 * screen.bars[0].ratio);

    let combined = combine_results_refs(&[CombinationFactor { case_id: 1, factor: 1.4 }], &[(1, &r)]).unwrap();
    assert_eq!(second_order(&combined.structured_diagnostics), warned(vec![1]));
}

#[test]
fn a_deferred_screen_holds_the_truss_bar_frame_wide_until_solved_undeferred() {
    use dedaliano_engine::solver::buckling::defer_sway_screen;
    defer_sway_screen(true);
    let deferred = solve_2d(&truss_v(false, 2e-9));
    defer_sway_screen(false);
    let deferred = deferred.unwrap();
    assert_eq!(second_order(&deferred.structured_diagnostics), unbounded());
    assert_eq!(deferred.result_summary.as_ref().and_then(|s| s.truss_screen.as_ref()).and_then(|t| t.sway), None);
    assert_eq!(second_order(&solve_2d(&truss_v(false, 2e-9)).unwrap().structured_diagnostics), warned(vec![1]));
}

#[test]
fn a_combination_bounds_each_truss_bar_by_its_factored_case_ratios() {
    let iz = 2e-9 * truss_v_ratio(&solve_2d(&truss_v(false, 2e-9)).unwrap(), 1, 2e-9) / (0.8 * SECOND_ORDER_RATIO);
    let r = solve_2d(&truss_v(false, iz)).unwrap();
    assert!((truss_v_ratio(&r, 1, iz) - 0.8 * SECOND_ORDER_RATIO).abs() < 1e-9);
    assert_eq!(second_order(&r.structured_diagnostics), near(vec![1]));
    let combined = combine_results_refs(&[CombinationFactor { case_id: 1, factor: 1.0 }, CombinationFactor { case_id: 2, factor: 0.5 }], &[(1, &r), (2, &r)]).unwrap();
    assert_eq!(second_order(&combined.structured_diagnostics), warned(vec![1]), "1.0·0.08 + 0.5·0.08");
    let combined = combine_results_refs(&[CombinationFactor { case_id: 1, factor: 1.2 }], &[(1, &r)]).unwrap();
    assert_eq!(second_order(&combined.structured_diagnostics), vec![]);
}

/// A truss-only mast, `panels` 1 m panels tall and 0.5 m wide, pinned at its base, with `p` down
/// and a hundredth of it sideways at each top node.
fn truss_mast(panels: usize, p: f64) -> SolverInput {
    let mut nodes = serde_json::Map::new();
    for k in 0..=panels {
        nodes.insert((2 * k + 1).to_string(), json!({"id": 2 * k + 1, "x": 0.0, "z": k as f64}));
        nodes.insert((2 * k + 2).to_string(), json!({"id": 2 * k + 2, "x": 0.5, "z": k as f64}));
    }
    let mut elements = serde_json::Map::new();
    let mut bar = |i: usize, j: usize| { let id = elements.len() + 1; elements.insert(id.to_string(), json!({"id": id, "type": "truss", "nodeI": i, "nodeJ": j, "materialId": 1, "sectionId": 1})); };
    for k in 0..panels {
        let (a, b, c, d) = (2 * k + 1, 2 * k + 2, 2 * k + 3, 2 * k + 4);
        bar(a, c);
        bar(b, d);
        bar(a, d);
        bar(c, d);
    }
    let top = 2 * panels + 1;
    serde_json::from_value(json!({
        "nodes": nodes,
        "materials": {"1": {"id": 1, "e": E, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 1e-4, "iz": 1e-6}},
        "elements": elements,
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "pinned"}, "2": {"id": 2, "nodeId": 2, "type": "pinned"}},
        "loads": [
            {"type": "nodal", "data": {"nodeId": top, "fx": p / 100.0, "fz": -p, "my": 0.0}},
            {"type": "nodal", "data": {"nodeId": top + 1, "fx": 0.0, "fz": -p, "my": 0.0}},
        ],
    }))
    .unwrap()
}

#[test]
fn a_slender_truss_mast_is_unbounded_though_every_bar_passes_on_its_own_length() {
    let input = truss_mast(10, 10.0);
    let r = solve_2d(&input).unwrap();
    let alpha = solve_buckling_2d(&input, 1).unwrap().modes[0].load_factor;
    assert!(alpha < TRUSS_ALPHA_CR, "α_cr {alpha}");
    let screen = r.result_summary.as_ref().and_then(|s| s.truss_screen.clone()).unwrap();
    assert!(!screen.bars.is_empty() && screen.bars.iter().all(|b| b.ratio < SECOND_ORDER_RATIO / SECOND_ORDER_NEAR_FACTOR), "{screen:?}");
    assert_eq!(second_order(&r.structured_diagnostics), unbounded());
    let combined = combine_results_refs(&[CombinationFactor { case_id: 1, factor: 1.0 }], &[(1, &r)]).unwrap();
    assert_eq!(second_order(&combined.structured_diagnostics), unbounded());

    let stiff = truss_mast(10, 0.5);
    assert!(solve_buckling_2d(&stiff, 1).unwrap().modes[0].load_factor >= TRUSS_ALPHA_CR);
    assert_eq!(second_order(&solve_2d(&stiff).unwrap().structured_diagnostics), vec![]);
    let pair = solve_2d(&stiff).unwrap();
    let combined = combine_results_refs(&[CombinationFactor { case_id: 1, factor: 20.0 }], &[(1, &pair)]).unwrap();
    assert_eq!(second_order(&combined.structured_diagnostics), unbounded(), "20 times a load with α_cr under 200");
}

#[test]
fn a_p_delta_result_does_not_carry_the_linear_screen() {
    use dedaliano_engine::solver::pdelta::{solve_pdelta_2d, solve_pdelta_3d};
    let p = solve_pdelta_2d(&portal("pinned", 250.0, 0.01), 30, 1e-6).unwrap();
    assert_eq!(second_order(&p.linear_results.structured_diagnostics), unbounded());
    assert_eq!(second_order(&p.results.structured_diagnostics), vec![]);
    let p = solve_pdelta_3d(&cantilever_3d(2, -100.0, E, 1.0, IDENTITY, [0.0; 3]), 30, 1e-6).unwrap();
    assert_eq!(second_order(&p.linear_results.structured_diagnostics), warned(vec![1, 2]));
    assert_eq!(second_order(&p.results.structured_diagnostics), vec![]);
}

#[test]
fn a_much_larger_force_elsewhere_does_not_hide_a_bounded_member() {
    let mut input = cantilever_2d(1, -100.0, E, 1.0);
    let mut value = serde_json::to_value(&input).unwrap();
    value["nodes"]["3"] = json!({"id": 3, "x": 0.0, "z": 5.0});
    value["nodes"]["4"] = json!({"id": 4, "x": L, "z": 5.0});
    value["sections"]["2"] = json!({"id": 2, "a": 1e6, "iz": 1e3});
    value["elements"]["2"] = json!({"id": 2, "type": "frame", "nodeI": 3, "nodeJ": 4, "materialId": 1, "sectionId": 2});
    value["supports"]["2"] = json!({"id": 2, "nodeId": 3, "type": "fixed"});
    value["loads"].as_array_mut().unwrap().push(json!({"type": "nodal", "data": {"nodeId": 4, "fx": 1e13, "fz": 0.0, "my": 0.0}}));
    input = serde_json::from_value(value).unwrap();
    let r = solve_2d(&input).unwrap();
    assert!(r.element_forces.iter().any(|f| f.element_id == 2 && f.n_start > 9e12), "{:?}", r.element_forces);
    assert_eq!(second_order(&r.structured_diagnostics), warned(vec![1]));
}

#[test]
fn a_much_larger_force_elsewhere_does_not_hide_an_unbounded_member() {
    let mut value = serde_json::to_value(portal("pinned", 216.0, 0.0)).unwrap();
    value["nodes"]["5"] = json!({"id": 5, "x": 20.0, "z": 0.0});
    value["nodes"]["6"] = json!({"id": 6, "x": 23.0, "z": 0.0});
    value["sections"]["3"] = json!({"id": 3, "a": 1e6, "iz": 1e3});
    value["elements"]["4"] = json!({"id": 4, "type": "frame", "nodeI": 5, "nodeJ": 6, "materialId": 1, "sectionId": 3});
    value["supports"]["3"] = json!({"id": 3, "nodeId": 5, "type": "fixed"});
    value["sections"]["3"] = json!({"id": 3, "a": 1e9, "iz": 1e6});
    value["loads"].as_array_mut().unwrap().push(json!({"type": "nodal", "data": {"nodeId": 6, "fx": 1e16, "fz": 0.0, "my": 0.0}}));
    let r = solve_2d(&serde_json::from_value(value).unwrap()).unwrap();
    assert!(r.element_forces.iter().any(|f| f.element_id == 4 && f.n_start > 9e15), "{:?}", r.element_forces);
    assert_eq!(second_order(&r.structured_diagnostics), unbounded());
}

#[test]
fn a_much_larger_force_at_its_supports_does_not_hide_an_unbounded_member() {
    let mut value = serde_json::to_value(portal("pinned", 216.0, 0.0)).unwrap();
    value["nodes"]["5"] = json!({"id": 5, "x": -3.0, "z": 0.0});
    value["nodes"]["6"] = json!({"id": 6, "x": 7.0, "z": 0.0});
    value["sections"]["3"] = json!({"id": 3, "a": 1e9, "iz": 1e6});
    value["elements"]["4"] = json!({"id": 4, "type": "truss", "nodeI": 5, "nodeJ": 1, "materialId": 1, "sectionId": 3});
    value["elements"]["5"] = json!({"id": 5, "type": "truss", "nodeI": 4, "nodeJ": 6, "materialId": 1, "sectionId": 3});
    value["supports"]["4"] = json!({"id": 4, "nodeId": 6, "type": "pinned", "dx": 1e7});
    value["supports"]["5"] = json!({"id": 5, "nodeId": 5, "type": "pinned", "dx": -1e7});
    let r = solve_2d(&serde_json::from_value(value).unwrap()).unwrap();
    assert!(r.element_forces.iter().filter(|f| f.element_id >= 4).all(|f| f.n_start > 1e15), "{:?}", r.element_forces);
    assert_eq!(second_order(&r.structured_diagnostics), unbounded());
}

#[test]
fn compression_let_off_as_round_off_still_counts_once_a_combination_scales_it_up() {
    let tiny = solve_2d(&portal("pinned", 1e-6, 0.0)).unwrap();
    assert_eq!(second_order(&tiny.structured_diagnostics), vec![], "1e-6 kN is under 1e-9 of the columns' Euler load");
    let combined = combine_results_refs(&[CombinationFactor { case_id: 1, factor: 1e10 }], &[(1, &tiny)]).unwrap();
    assert!(combined.element_forces.iter().any(|f| f.n_start < -1e3), "{:?}", combined.element_forces);
    assert_eq!(second_order(&combined.structured_diagnostics), warned(vec![]));
    let combined = combine_results_refs(&[CombinationFactor { case_id: 1, factor: 10.0 }], &[(1, &tiny)]).unwrap();
    assert_eq!(second_order(&combined.structured_diagnostics), vec![]);

    let mut value = serde_json::to_value(cantilever_3d(1, -1.0, E, 1e-9, IDENTITY, [0.0; 3])).unwrap();
    value["supports"]["1"]["kx"] = json!(1e12);
    let tiny = solve_3d(&serde_json::from_value(value).unwrap()).unwrap();
    assert_eq!(second_order(&tiny.structured_diagnostics), vec![], "3D: a spring support bounds nothing, and 1e-9 kN is round-off");
    let combined = combine_results_3d_refs(&[CombinationFactor { case_id: 1, factor: 1e10 }], &[(1, &tiny)]).unwrap().unwrap();
    assert_eq!(second_order(&combined.structured_diagnostics), warned(vec![]));
}
