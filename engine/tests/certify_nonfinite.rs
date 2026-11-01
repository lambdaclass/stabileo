//! Issue #335: a certificate never passes on a non-finite number.
//!
//! Property, for every certificate entry point the WASM layer exposes: when
//! one number of a valid input (or of the reported results, for the
//! `certify_*_results` functions) is replaced by NaN, ±∞ or a huge or tiny
//! finite value, the outcome is an `Err` or an `Ok` whose every number is
//! finite (except the documented +∞ fields, `certify::finite`). With
//! reported results carrying a non-finite number, the certificate is
//! uncertified.
//!
//! JSON cannot carry NaN or ±∞, so the inputs are mutated as CBOR values
//! (`ciborium`), which deserialize into the same typed structs.

use ciborium::value::Value;
use dedaliano_engine::certify::finite::{non_finite_paths, undocumented_non_finite};
use dedaliano_engine::certify::{self, bundle, combinations, design, dynamics, harmonic, modal, pdelta, plastic, plastic_3d};
use dedaliano_engine::certify::{buckling, spectral};
use dedaliano_engine::solver::harmonic::{HarmonicInput, HarmonicInput3D};
use dedaliano_engine::solver::load_cases::{MultiCaseInput, MultiCaseInput3D};
use dedaliano_engine::solver::{linear, modal as smodal, spectral as sspectral};
use dedaliano_engine::types::*;
use proptest::prelude::*;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{json, Value as Json};
use std::collections::HashMap;

const SPECIALS: [f64; 9] = [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 1e308, -1e308, 1e300, 1e-300, 5e-324, -f64::MAX];

fn fixture(name: &str) -> Json {
    let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn m2() -> Json {
    fixture("ex-portal-frame-input.json")
}

fn m3() -> Json {
    fixture("ex-3d-portal-frame-input.json")
}

fn dens() -> Json {
    json!({ "1": 7850.0, "2": 2500.0 })
}

fn spectrum() -> Json {
    json!({ "name": "t", "inG": true, "points": [
        { "period": 0.0, "sa": 0.4 }, { "period": 0.5, "sa": 1.0 }, { "period": 2.0, "sa": 0.3 }
    ]})
}

fn multi_case(model: &Json) -> Json {
    let mut solver = model.clone();
    let loads = solver["loads"].take();
    solver["loads"] = json!([]);
    json!({
        "solver": solver,
        "loadCases": [{ "name": "D", "loads": loads }, { "name": "L", "loads": loads }],
        "combinations": [{ "name": "1.2D+1.6L", "factors": { "D": 1.2, "L": 1.6 } }]
    })
}

fn spectral_2d() -> Json {
    let s: SolverInput = serde_json::from_value(m2()).unwrap();
    let d: HashMap<String, f64> = serde_json::from_value(dens()).unwrap();
    let modes = smodal::solve_modal_2d(&s, &d, 3).unwrap().modes;
    json!({ "solver": m2(), "modes": modes, "densities": dens(), "spectrum": spectrum(), "direction": "X" })
}

fn spectral_3d() -> Json {
    let s: SolverInput3D = serde_json::from_value(m3()).unwrap();
    let d: HashMap<String, f64> = serde_json::from_value(dens()).unwrap();
    let modes = smodal::solve_modal_3d(&s, &d, 3).unwrap().modes;
    json!({ "solver": m3(), "modes": modes, "densities": dens(), "spectrum": spectrum(), "direction": "X" })
}

fn plastic_input(model: Json, three_d: bool) -> Json {
    let sec = |a: f64, i: f64| {
        if three_d {
            json!({ "a": a, "iy": i, "iz": i, "materialId": 1, "b": 0.15, "h": 0.3 })
        } else {
            json!({ "a": a, "iz": i, "materialId": 1, "b": 0.15, "h": 0.3 })
        }
    };
    let sections: serde_json::Map<String, Json> = model["sections"]
        .as_object()
        .unwrap()
        .iter()
        .map(|(k, s)| (k.clone(), sec(s["a"].as_f64().unwrap(), s["iz"].as_f64().unwrap())))
        .collect();
    let materials: serde_json::Map<String, Json> =
        model["materials"].as_object().unwrap().keys().map(|k| (k.clone(), json!({ "fy": 250.0 }))).collect();
    json!({ "solver": model, "sections": sections, "materials": materials })
}

fn steel() -> Json {
    json!({
        "members": [{
            "elementId": 1, "fy": 345e3, "fu": 450e3, "ag": 1.23e-2, "aw": 3.08e-3,
            "lby": 4.0, "lbz": 4.0, "iy": 2.22e-4, "iz": 7.25e-5, "ry": 0.134, "rz": 0.0768,
            "zy": 1.59e-3, "zz": 7.23e-4, "sy": 1.44e-3, "sz": 4.77e-4, "j": 9.1e-7, "cw": 1.56e-6,
            "lb": 4.0, "cb": 1.0, "e": 200e6, "depth": 0.308,
            "compressionElements": [
                { "kind": "rolledFlange", "b": 0.1525, "t": 0.0154, "count": 4.0 },
                { "kind": "web", "b": 0.255, "t": 0.0099 }
            ]
        }],
        "demands": [{ "forces": { "elementId": 1, "n": -300.0, "my": 80.0, "vy": 20.0 }, "bound": { "n": 0.5, "my": 0.2 } }]
    })
}

/// The kinds of certificate, each with its base input and runner. A runner
/// returns `Err` when the input is refused (by deserialization or the entry
/// point) and `Ok(Some(message))` on a property violation.
type Runner = fn(&Value) -> Result<Option<String>, String>;

thread_local! {
    /// Whether the last `Ok` result claimed a certificate anywhere.
    static CLAIMED: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

fn claims(out: &Json) -> bool {
    match out {
        Json::Object(m) => {
            m.get("status").and_then(Json::as_str) == Some("certified")
                || m.get("certified").and_then(Json::as_bool) == Some(true)
                || m.get("stabilityCertified").and_then(Json::as_bool) == Some(true)
                || m.values().any(claims)
        }
        Json::Array(a) => a.iter().any(claims),
        _ => false,
    }
}

/// Deserialize the (mutated) CBOR value; a value the type refuses is fine.
fn typed<T: DeserializeOwned>(v: &Value) -> Option<T> {
    v.deserialized().ok()
}

/// `Err`, or an `Ok` with only finite numbers (outside the documented +∞).
fn finite_ok<T: Serialize>(name: &str, r: Result<T, String>) -> Result<Option<String>, String> {
    let out = r?;
    CLAIMED.with(|c| c.set(serde_json::to_value(&out).is_ok_and(|v| claims(&v))));
    let bad = undocumented_non_finite(&out);
    Ok((!bad.is_empty()).then(|| format!("{name}: Ok result with non-finite numbers at {bad:?}")))
}

macro_rules! run {
    ($name:literal, $t:ty, |$i:ident| $e:expr) => {
        (|v: &Value| -> Result<Option<String>, String> {
            let $i: $t = typed(v).ok_or("refused by deserialization")?;
            finite_ok($name, $e)
        }) as Runner
    };
}

fn kinds() -> Vec<(&'static str, Json, Runner)> {
    vec![
        ("linear_2d", m2(), run!("linear_2d", SolverInput, |i| certify::certify_linear_2d_full(&i))),
        ("linear_3d", m3(), run!("linear_3d", SolverInput3D, |i| certify::certify_linear_3d_full(&i))),
        ("bundle_2d", m2(), run!("bundle_2d", SolverInput, |i| bundle::export_linear_bundle_2d(&i))),
        ("bundle_3d", m3(), run!("bundle_3d", SolverInput3D, |i| bundle::export_linear_bundle_3d(&i))),
        ("buckling_2d", m2(), run!("buckling_2d", SolverInput, |i| buckling::certify_buckling_2d(&i, 2))),
        ("buckling_3d", m3(), run!("buckling_3d", SolverInput3D, |i| buckling::certify_buckling_3d(&i, 2))),
        ("pdelta_2d", m2(), run!("pdelta_2d", SolverInput, |i| pdelta::certify_pdelta_2d(&i, 20, 1e-8))),
        ("pdelta_3d", m3(), run!("pdelta_3d", SolverInput3D, |i| pdelta::certify_pdelta_3d(&i, 20, 1e-8))),
        (
            "modal_2d",
            json!({ "solver": m2(), "densities": dens() }),
            run!("modal_2d", ModalInput, |i| modal::certify_modal_2d(&i.solver, &i.densities, 3)),
        ),
        (
            "modal_3d",
            json!({ "solver": m3(), "densities": dens() }),
            run!("modal_3d", ModalInput3D, |i| modal::certify_modal_3d(&i.solver, &i.densities, 3)),
        ),
        ("spectral_2d", spectral_2d(), run!("spectral_2d", SpectralInput, |i| spectral::certify_spectral_2d(&i))),
        ("spectral_3d", spectral_3d(), run!("spectral_3d", SpectralInput3D, |i| spectral::certify_spectral_3d(&i))),
        (
            "harmonic_2d",
            json!({ "solver": m2(), "densities": dens(), "frequencies": [0.5, 2.0, 8.0], "dampingRatio": 0.05,
                    "responseNodeId": 3, "responseDof": "x" }),
            run!("harmonic_2d", HarmonicInput, |i| harmonic::certify_harmonic_2d(&i)),
        ),
        (
            "harmonic_3d",
            json!({ "solver": m3(), "densities": dens(), "frequencies": [0.5, 2.0, 8.0], "dampingRatio": 0.05,
                    "responseNodeId": 8, "responseDof": "x" }),
            run!("harmonic_3d", HarmonicInput3D, |i| harmonic::certify_harmonic_3d(&i)),
        ),
        (
            "time_history_2d",
            json!({ "solver": m2(), "densities": dens(), "timeStep": 0.01, "nSteps": 20,
                    "groundAccel": vec![0.5; 20], "groundDirection": "X" }),
            run!("time_history_2d", TimeHistoryInput, |i| dynamics::certify_time_history_2d(&i)),
        ),
        (
            "time_history_3d",
            json!({ "solver": m3(), "densities": dens(), "timeStep": 0.01, "nSteps": 20, "groundAccelX": vec![0.5; 20] }),
            run!("time_history_3d", TimeHistoryInput3D, |i| dynamics::certify_time_history_3d(&i)),
        ),
        ("plastic_2d", plastic_input(m2(), false), run!("plastic_2d", PlasticInput, |i| plastic::certify_plastic_2d(&i))),
        ("plastic_3d", plastic_input(m3(), true), run!("plastic_3d", PlasticInput3D, |i| plastic_3d::certify_plastic_3d(&i))),
        (
            "multi_case_2d",
            multi_case(&m2()),
            run!("multi_case_2d", MultiCaseInput, |i| combinations::certify_multi_case_2d(&i)),
        ),
        (
            "multi_case_3d",
            multi_case(&m3()),
            run!("multi_case_3d", MultiCaseInput3D, |i| combinations::certify_multi_case_3d(&i)),
        ),
        (
            "steel_members",
            steel(),
            run!("steel_members", design::CertifiedSteelCheckInput, |i| Ok::<_, String>(design::certify_steel_members(&i))),
        ),
    ]
}

/// Paths (indices into nested arrays/maps) of every float leaf.
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

fn to_cbor<T: Serialize>(x: &T) -> Value {
    Value::serialized(x).unwrap()
}

/// The base input as a CBOR value of the typed input (f64 fields are floats).
fn base_value(kind: &str, json: &Json) -> Value {
    macro_rules! via {
        ($t:ty) => {
            to_cbor(&serde_json::from_value::<$t>(json.clone()).unwrap_or_else(|e| panic!("{kind}: {e}")))
        };
    }
    match kind {
        "linear_2d" | "bundle_2d" | "buckling_2d" | "pdelta_2d" => via!(SolverInput),
        "linear_3d" | "bundle_3d" | "buckling_3d" | "pdelta_3d" => via!(SolverInput3D),
        "modal_2d" => via!(ModalInput),
        "modal_3d" => via!(ModalInput3D),
        "spectral_2d" => via!(SpectralInput),
        "spectral_3d" => via!(SpectralInput3D),
        "harmonic_2d" => via!(HarmonicInput),
        "harmonic_3d" => via!(HarmonicInput3D),
        "time_history_2d" => via!(TimeHistoryInput),
        "time_history_3d" => via!(TimeHistoryInput3D),
        "plastic_2d" => via!(PlasticInput),
        "plastic_3d" => via!(PlasticInput3D),
        "multi_case_2d" => via!(MultiCaseInput),
        "multi_case_3d" => via!(MultiCaseInput3D),
        "steel_members" => via!(design::CertifiedSteelCheckInput),
        _ => unreachable!(),
    }
}

/// Every unmutated base input is certified (the mutations start from inputs
/// the certificates accept, not from ones they already refuse).
#[test]
fn base_inputs_are_accepted_and_finite() {
    for (kind, json, runner) in kinds() {
        let v = base_value(kind, &json);
        if kind == "plastic_2d" {
            crate::common::assert_containment(runner(&v), "PL-2D-INVARIANCE");
            continue;
        }
        assert_eq!(runner(&v), Ok(None), "{kind}");
        // A bundle is `Ok` only when certified; it has no status field.
        assert!(kind.starts_with("bundle") || CLAIMED.with(|c| c.get()), "{kind}: the base input is not certified");
    }
}

/// Every float leaf of every input set to each special value, exhaustively
/// for NaN and +∞ on the small models (a few thousand runs).
#[test]
fn every_leaf_nan_or_inf_is_refused_or_finite() {
    for (kind, json, runner) in kinds() {
        let base = base_value(kind, &json);
        let mut leaves = Vec::new();
        float_leaves(&base, &mut Vec::new(), &mut leaves);
        assert!(!leaves.is_empty(), "{kind}: no float leaves");
        // Long arrays (ground accelerations, mode shapes) are sampled.
        let step = (leaves.len() / 150).max(1);
        for leaf in leaves.iter().step_by(step) {
            for x in [f64::NAN, f64::INFINITY] {
                let mut v = base.clone();
                *leaf_mut(&mut v, leaf) = Value::Float(x);
                if let Ok(Some(msg)) = runner(&v) {
                    panic!("{kind}, leaf {leaf:?} = {x}: {msg}");
                }
            }
        }
    }
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 2000, ..ProptestConfig::default() })]

    /// Random kind, random float leaf, random special value (NaN, ±∞, ±huge,
    /// tiny, subnormal), up to three leaves at once.
    #[test]
    fn mutated_inputs_are_refused_or_finite(
        kind_idx in 0usize..64,
        picks in proptest::collection::vec((any::<prop::sample::Index>(), 0usize..SPECIALS.len()), 1..=3),
    ) {
        let ks = kinds();
        let (kind, json, runner) = &ks[kind_idx % ks.len()];
        let base = base_value(kind, json);
        let mut leaves = Vec::new();
        float_leaves(&base, &mut Vec::new(), &mut leaves);
        let mut v = base.clone();
        for (idx, s) in &picks {
            *leaf_mut(&mut v, idx.get(&leaves)) = Value::Float(SPECIALS[*s]);
        }
        if let Ok(Some(msg)) = runner(&v) {
            prop_assert!(false, "{kind}: {msg}");
        }
    }
}

/// The `certify_*_results` functions take reported results: a non-finite
/// reported value is never certified, and the certificate stays finite.
#[test]
fn non_finite_reported_results_are_uncertified() {
    // Linear, 2D and 3D.
    let s2: SolverInput = serde_json::from_value(m2()).unwrap();
    let r2 = linear::solve_2d(&s2).unwrap();
    let s3: SolverInput3D = serde_json::from_value(m3()).unwrap();
    let r3 = linear::solve_3d(&s3).unwrap();
    assert!(certify::certify_results_2d(&s2, &r2).is_certified());
    assert!(certify::certify_results_3d(&s3, &r3).is_certified());
    // Spectral, 2D and 3D.
    let sp2: SpectralInput = serde_json::from_value(spectral_2d()).unwrap();
    let rs2 = sspectral::solve_spectral_2d(&sp2).unwrap();
    let sp3: SpectralInput3D = serde_json::from_value(spectral_3d()).unwrap();
    let rs3 = sspectral::solve_spectral_3d(&sp3).unwrap();
    assert!(spectral::certify_spectral_results_2d(&sp2, &rs2).is_certified());
    assert!(spectral::certify_spectral_results_3d(&sp3, &rs3).is_certified());
    // P-Delta (any candidate works): the linear results.
    assert!(pdelta::certify_pdelta_results_2d(&s2, &r2).is_certified());

    fn each_leaf<T: Serialize + DeserializeOwned>(r: &T, mut f: impl FnMut(&T, String)) {
        let base = to_cbor(r);
        let mut leaves = Vec::new();
        float_leaves(&base, &mut Vec::new(), &mut leaves);
        let step = (leaves.len() / 120).max(1);
        for leaf in leaves.iter().step_by(step) {
            for x in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
                let mut v = base.clone();
                *leaf_mut(&mut v, leaf) = Value::Float(x);
                let t: T = v.deserialized().unwrap();
                if non_finite_paths(&t).is_empty() {
                    continue; // the leaf is not serialized back (skipped field)
                }
                f(&t, format!("leaf {leaf:?} = {x}"));
            }
        }
    }
    let ok = |name: &str, what: String, certified: bool, cert_bad: Vec<String>| {
        assert!(!certified, "{name}: certified with a non-finite reported value ({what})");
        assert!(cert_bad.is_empty(), "{name}: non-finite certificate ({what}): {cert_bad:?}");
    };
    each_leaf(&r2, |r, w| {
        let c = certify::certify_results_2d(&s2, r);
        ok("linear_2d", w, c.is_certified(), undocumented_non_finite(&c));
    });
    each_leaf(&r3, |r, w| {
        let c = certify::certify_results_3d(&s3, r);
        ok("linear_3d", w, c.is_certified(), undocumented_non_finite(&c));
    });
    each_leaf(&rs2, |r, w| {
        let c = spectral::certify_spectral_results_2d(&sp2, r);
        ok("spectral_2d", w, c.is_certified(), undocumented_non_finite(&c));
    });
    each_leaf(&rs3, |r, w| {
        let c = spectral::certify_spectral_results_3d(&sp3, r);
        ok("spectral_3d", w, c.is_certified(), undocumented_non_finite(&c));
    });
    each_leaf(&r2, |r, w| {
        let c = pdelta::certify_pdelta_results_2d(&s2, r);
        ok("pdelta_2d", w, c.is_certified(), undocumented_non_finite(&c));
    });
}
