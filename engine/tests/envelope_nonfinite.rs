//! Issue #1350: an envelope is an `Err` or an `Ok` whose every number is finite.
//!
//! Inputs are mutated as CBOR values because JSON cannot carry NaN or ±∞.

use ciborium::value::Value;
use dedaliano_engine::certify::finite::non_finite_paths;
use dedaliano_engine::postprocess::combinations::{
    combine_results, combine_results_checked, combine_results_refs, combine_results_3d, compute_envelope, compute_envelope_3d, CaseEntry, CaseEntry3D,
    CombinationFactor, CombinationInput, CombinationInput3D,
};
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use proptest::prelude::*;
use serde::Serialize;

const SPECIALS: [f64; 9] = [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 1e308, -1e308, 1e300, 1e-300, 5e-324, -f64::MAX];

fn fixture<T: serde::de::DeserializeOwned>(name: &str) -> T {
    let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn results_2d() -> Vec<AnalysisResults> {
    let r = linear::solve_2d(&fixture::<SolverInput>("ex-portal-frame-input.json")).unwrap();
    let scaled = combine_results(&CombinationInput {
        factors: vec![CombinationFactor { case_id: 1, factor: -0.5 }],
        cases: vec![CaseEntry { case_id: 1, results: r.clone() }],
    })
    .unwrap();
    vec![r, scaled]
}

fn results_3d() -> Vec<AnalysisResults3D> {
    let r = linear::solve_3d(&fixture::<SolverInput3D>("ex-3d-portal-frame-input.json")).unwrap();
    let scaled = combine_results_3d(&CombinationInput3D {
        plate_thicknesses: vec![],
        factors: vec![CombinationFactor { case_id: 1, factor: -0.5 }],
        cases: vec![CaseEntry3D { case_id: 1, results: r.clone() }],
    })
    .unwrap()
    .unwrap();
    vec![r, scaled]
}

fn float_leaves(v: &Value, path: &mut Vec<usize>, out: &mut Vec<Vec<usize>>) {
    match v {
        Value::Float(_) => out.push(path.clone()),
        Value::Array(a) => {
            for (i, x) in a.iter().enumerate() {
                path.push(i);
                float_leaves(x, path, out);
                path.pop();
            }
        }
        Value::Map(m) => {
            for (i, (_, x)) in m.iter().enumerate() {
                path.push(i);
                float_leaves(x, path, out);
                path.pop();
            }
        }
        Value::Tag(_, x) => float_leaves(x, path, out),
        _ => {}
    }
}

fn leaf_mut<'a>(v: &'a mut Value, path: &[usize]) -> &'a mut Value {
    match (v, path.split_first()) {
        (v, None) => v,
        (Value::Array(a), Some((&i, rest))) => leaf_mut(&mut a[i], rest),
        (Value::Map(m), Some((&i, rest))) => leaf_mut(&mut m[i].1, rest),
        (Value::Tag(_, x), Some(_)) => leaf_mut(x, path),
        _ => unreachable!("path from float_leaves"),
    }
}

fn leaves(base: &Value) -> Vec<Vec<usize>> {
    let mut out = Vec::new();
    float_leaves(base, &mut Vec::new(), &mut out);
    assert!(!out.is_empty());
    out
}

fn violation(three_d: bool, v: &Value) -> Option<String> {
    fn check<T: Serialize>(r: Result<T, String>) -> Option<String> {
        let bad = non_finite_paths(&r.ok()?);
        (!bad.is_empty()).then(|| format!("Ok envelope with non-finite numbers at {bad:?}"))
    }
    if three_d {
        check(compute_envelope_3d(&v.deserialized::<Vec<AnalysisResults3D>>().ok()?))
    } else {
        check(compute_envelope(&v.deserialized::<Vec<AnalysisResults>>().ok()?))
    }
}

fn base(three_d: bool) -> Value {
    if three_d { Value::serialized(&results_3d()).unwrap() } else { Value::serialized(&results_2d()).unwrap() }
}

#[test]
fn base_envelopes_are_finite() {
    let e2 = compute_envelope(&results_2d()).unwrap();
    assert!(non_finite_paths(&e2).is_empty() && e2.moment.global_max > 0.0);
    let e3 = compute_envelope_3d(&results_3d()).unwrap();
    assert!(non_finite_paths(&e3).is_empty() && e3.moment_z.global_max > 0.0);
}

#[test]
fn every_leaf_special_is_refused_or_finite() {
    for three_d in [false, true] {
        let b = base(three_d);
        for leaf in leaves(&b) {
            for x in SPECIALS {
                let mut v = b.clone();
                *leaf_mut(&mut v, &leaf) = Value::Float(x);
                if let Some(msg) = violation(three_d, &v) {
                    panic!("3d={three_d}, leaf {leaf:?} = {x}: {msg}");
                }
            }
        }
    }
}

#[test]
fn moment_overflow_is_refused_2d_and_3d() {
    let mut r2 = results_2d();
    r2[1].element_forces[0].v_start = 1e308;
    let e = compute_envelope(&r2).unwrap_err();
    assert!(e.contains("moment of element") && e.contains("result 1"), "{e}");

    let mut r3 = results_3d();
    r3[1].element_forces[0].vz_start = -1e308;
    let e = compute_envelope_3d(&r3).unwrap_err();
    assert!(e.contains("momentY of element") && e.contains("result 1"), "{e}");
}

#[test]
fn nan_in_a_later_result_is_refused() {
    let mut r2 = results_2d();
    r2[1].element_forces[0].m_end = f64::NAN;
    let e = compute_envelope(&r2).unwrap_err();
    assert!(e.contains("result 1") && e.contains("elementForces[0].mEnd=NaN"), "{e}");

    let mut r3 = results_3d();
    r3[1].displacements[0].ux = f64::NAN;
    let e = compute_envelope_3d(&r3).unwrap_err();
    assert!(e.contains("result 1") && e.contains("displacements[0].ux=NaN"), "{e}");
}

#[test]
fn no_results_is_an_error() {
    assert!(compute_envelope(&[]).is_err());
    assert!(compute_envelope_3d(&[]).is_err());
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 512, ..ProptestConfig::default() })]

    #[test]
    fn mutated_results_are_refused_or_finite(
        three_d in any::<bool>(),
        picks in proptest::collection::vec((any::<prop::sample::Index>(), 0usize..SPECIALS.len()), 1..=3),
    ) {
        let b = base(three_d);
        let ls = leaves(&b);
        let mut v = b.clone();
        for (idx, s) in &picks {
            *leaf_mut(&mut v, idx.get(&ls)) = Value::Float(SPECIALS[*s]);
        }
        if let Some(msg) = violation(three_d, &v) {
            prop_assert!(false, "3d={three_d}: {msg}");
        }
    }
}

#[test]
fn issue_2222_saved_planar_intervals_return_errors_before_sampling() {
    for axis in 0..2 {
        for (a, b) in [(-1.0, 1.0), (2.0, 4.0), (0.0, 0.0), (0.0, 1e-11), (f64::NAN, 1.0), (0.0, f64::INFINITY)] {
            let mut results = results_2d();
            let ef = &mut results[0].element_forces[0];
            ef.length = 3.0;
            ef.distributed_loads.clear();
            ef.distributed_loads_x.clear();
            let loads = if axis == 0 { &mut ef.distributed_loads } else { &mut ef.distributed_loads_x };
            loads.push(DistributedLoadInfo { q_i: -2.0, q_j: -2.0, a, b });
            assert!(compute_envelope(&results).is_err());
            let combination = CombinationInput { factors: vec![CombinationFactor { case_id: 1, factor: 1.0 }], cases: vec![CaseEntry { case_id: 1, results: results[0].clone() }] };
            assert!(combine_results_checked(&combination).is_err());
            assert!(combine_results_refs(&combination.factors, &[(1, &results[0])]).is_none());
        }
    }
    assert!(compute_envelope(&results_2d()).unwrap().moment.global_max > 0.0);
}

#[test]
fn issue_2222_saved_spatial_intervals_return_errors_before_sampling() {
    for axis in 0..3 {
        for (a, b) in [(-1.0, 1.0), (2.0, 4.0), (0.0, 0.0), (0.0, 1e-11), (f64::NAN, 1.0), (0.0, f64::INFINITY)] {
            let mut results = results_3d();
            let ef = &mut results[0].element_forces[0];
            ef.length = 3.0;
            ef.distributed_loads_x.clear();
            ef.distributed_loads_y.clear();
            ef.distributed_loads_z.clear();
            let loads = match axis { 0 => &mut ef.distributed_loads_x, 1 => &mut ef.distributed_loads_y, _ => &mut ef.distributed_loads_z };
            loads.push(DistributedLoadInfo { q_i: -2.0, q_j: -2.0, a, b });
            assert!(compute_envelope_3d(&results).is_err());
            let combination = CombinationInput3D { factors: vec![CombinationFactor { case_id: 1, factor: 1.0 }], cases: vec![CaseEntry3D { case_id: 1, results: results[0].clone() }], plate_thicknesses: vec![] };
            assert!(combine_results_3d(&combination).is_err());
        }
    }
    assert!(compute_envelope_3d(&results_3d()).unwrap().moment_z.global_max > 0.0);
}

#[test]
fn issue_2222_saved_2d_certified_demands_refuse_mutated_intervals() {
    use dedaliano_engine::certify::combinations::*;
    use dedaliano_engine::certify::design::steel_demands_from_combinations_2d;
    use dedaliano_engine::solver::load_cases::MultiCaseInput;
    let solver = fixture::<SolverInput>("ex-portal-frame-input.json");
    let input: MultiCaseInput = serde_json::from_value(serde_json::json!({
        "loadCases": [{"name": "load", "loads": solver.loads}],
        "combinations": [{"name": "combination", "factors": {"load": 1.0}}], "solver": solver
    })).unwrap();
    let original = certify_multi_case_2d(&input).unwrap();
    assert!(!steel_demands_from_combinations_2d(&original, 3).unwrap().is_empty());
    for (a, b) in [(-1.0, 1.0), (0.0, 0.0), (0.0, 1e-11)] {
        let mut changed = original.clone();
        let ef = &mut changed.results.combination_results[0].results.element_forces[0];
        ef.distributed_loads = vec![DistributedLoadInfo { q_i: -2.0, q_j: -2.0, a, b }];
        assert!(steel_demands_from_combinations_2d(&changed, 3).is_err());
        let checked = certify_multi_case_results_2d(&input, changed.results);
        assert!(!checked.combinations[0].certified);
    }
}

#[test]
fn issue_2222_saved_3d_certified_demands_refuse_mutated_intervals() {
    use dedaliano_engine::certify::combinations::*;
    use dedaliano_engine::certify::design::steel_demands_from_combinations_3d;
    use dedaliano_engine::solver::load_cases::MultiCaseInput3D;
    let solver = fixture::<SolverInput3D>("ex-3d-portal-frame-input.json");
    let input: MultiCaseInput3D = serde_json::from_value(serde_json::json!({
        "loadCases": [{"name": "load", "loads": solver.loads}],
        "combinations": [{"name": "combination", "factors": {"load": 1.0}}], "solver": solver
    })).unwrap();
    let original = certify_multi_case_3d(&input).unwrap();
    assert!(!steel_demands_from_combinations_3d(&original, 3).unwrap().is_empty());
    for (a, b) in [(-1.0, 1.0), (0.0, 0.0), (0.0, 1e-11)] {
        let mut changed = original.clone();
        let ef = &mut changed.results.combination_results[0].results.element_forces[0];
        ef.distributed_loads_x = vec![DistributedLoadInfo { q_i: -2.0, q_j: -2.0, a, b }];
        assert!(steel_demands_from_combinations_3d(&changed, 3).is_err());
        let checked = certify_multi_case_results_3d(&input, changed.results);
        assert!(!checked.combinations[0].certified);
    }
}

#[test]
fn issue_2222_checked_combinations_report_overflow_before_recovery() {
    use dedaliano_engine::postprocess::combinations::{combine_results_3d_refs};
    let planar = results_2d().remove(0);
    let spatial = results_3d().remove(0);
    for factor in [1.0, f64::MAX] {
        let factors = vec![CombinationFactor { case_id: 1, factor }, CombinationFactor { case_id: 1, factor }];
        let input = CombinationInput { factors: factors.clone(), cases: vec![CaseEntry { case_id: 1, results: planar.clone() }] };
        let input3 = CombinationInput3D { factors: factors.clone(), cases: vec![CaseEntry3D { case_id: 1, results: spatial.clone() }], plate_thicknesses: vec![] };
        let planar_checked = combine_results_checked(&input);
        let spatial_checked = combine_results_3d(&input3);
        let spatial_refs = combine_results_3d_refs(&factors, &[(1, &spatial)]);
        if factor == 1.0 {
            dedaliano_engine::boundary::require_finite(&planar_checked.unwrap().unwrap()).unwrap();
            for out in [spatial_checked, spatial_refs] { dedaliano_engine::boundary::require_finite(&out.unwrap().unwrap()).unwrap(); }
        } else {
            for error in [planar_checked.unwrap_err(), spatial_checked.unwrap_err(), spatial_refs.unwrap_err()] {
                assert!(error.contains("non-finite number"), "{error}");
            }
            assert!(combine_results(&input).is_none());
        }
    }
}
