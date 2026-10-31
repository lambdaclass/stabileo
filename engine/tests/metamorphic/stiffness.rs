//! First coverage slice: strict priority checks and uniform stiffness scaling.
//! Models have mechanical loads, fixed supports and no independent springs or
//! imposed strains. E alone therefore scales all elastic stiffness (nu fixed).
use crate::{
    ana2, ana3,
    case::{Case2, Case3},
    checks2, checks3,
    generated::{self, ResponseShape},
    response::Resp,
    tally::Tally,
};
use dedaliano_engine::metamorphic::{compare::compare_with_floor, conditioning};

const PRIORITY: &[&str] = &[
    "linear",
    "plastic collapse",
    "time history",
    "kinematic check",
    "modal",
    "buckling",
];
const GEOMETRY: &[&str] = &["rotation", "relabel", "reversal", "units"];

fn cases() -> u64 {
    match std::env::var("METAMORPHIC_CASES") {
        Ok(s) => s
            .parse::<u64>()
            .ok()
            .filter(|n| *n > 0)
            .expect("METAMORPHIC_CASES must be a positive integer"),
        Err(std::env::VarError::NotPresent) => 512,
        Err(e) => panic!("METAMORPHIC_CASES: {e}"),
    }
}

fn invariants(name: &str, spatial: bool) -> Vec<&'static str> {
    let mut inv = GEOMETRY.to_vec();
    if !spatial {
        inv.push("mirror");
    }
    if ["linear", "time history", "plastic collapse", "buckling"].contains(&name) {
        inv.push("superposition"); // includes load scaling, inverse for factors
    }
    if ["linear", "time history"].contains(&name) {
        inv.push("reciprocity");
    }
    if name == "modal" {
        inv.push("modal orthogonality");
    }
    inv
}

fn covered(t: &Tally, name: &str, inv: &[&str]) {
    let cells = t.cells.lock().unwrap();
    assert_eq!(cells.len(), inv.len(), "unexpected coverage for {name}");
    for i in inv {
        let c = cells
            .get(&(name.into(), (*i).into()))
            .expect("missing comparison");
        assert_eq!(c.pass, 1, "{name} × {i}: {c:?}");
        assert_eq!(
            c.refused + c.unrep + c.inconclusive + c.fails.len(),
            0,
            "{name} × {i}: {c:?}"
        );
        assert!(c.ignored.is_empty(), "{name} × {i}: {c:?}");
    }
}

fn expected(name: &str, base: &Resp, factor: f64) -> Resp {
    let mut out = base.clone();
    for item in &mut out.0 {
        let scale = match name {
            "linear" if ["u", "r", "ry"].contains(&item.tag.as_str()) => 1.0 / factor,
            "modal"
                if matches!(
                    item.kind,
                    crate::response::Kind::Local(crate::response::Dim::FREQ, _)
                ) =>
            {
                factor.sqrt()
            }
            "buckling" if factor_tag(name, &item.tag) => factor,
            _ => 1.0, // reactions, forces, masses and plastic capacity unchanged
        };
        for v in &mut item.v {
            *v *= scale;
        }
        item.floor *= scale;
    }
    out
}

fn factor_tag(name: &str, tag: &str) -> bool {
    match name {
        "modal" => crate::response::frequency_index(tag).is_some(),
        "buckling" => tag
            .strip_prefix("lambda")
            .is_some_and(|k| !k.is_empty() && k.bytes().all(|b| b.is_ascii_digit())),
        "plastic collapse" => tag == "collapse_factor",
        _ => false,
    }
}

fn stiffness_witness(name: &str, r: &Resp) {
    let nonzero = |tag: &str, member: bool| {
        r.0.iter().any(|i| {
            i.tag == tag && i.elem.is_some() == member && i.v.iter().any(|v| v.abs() > 0.0)
        })
    };
    if name == "linear" {
        assert!(nonzero("u", false), "linear: no nonzero displacement");
        assert!(nonzero("R", false), "linear: no nonzero reaction");
        assert!(
            ["N", "V", "M"].iter().any(|tag| nonzero(tag, true)),
            "linear: no nonzero member force"
        );
        return;
    }
    let required = match name {
        "modal" => 6,
        "buckling" => 3,
        "plastic collapse" => 1,
        _ => unreachable!(),
    };
    let factors: Vec<_> = r.0.iter().filter(|i| factor_tag(name, &i.tag)).collect();
    assert!(
        factors.len() >= required,
        "{name}: {} factors, expected at least {required}",
        factors.len()
    );
    for item in factors {
        assert!(
            item.v.iter().all(|v| v.is_finite() && *v > 0.0),
            "{name} {} must be positive",
            item.tag
        );
    }
}

fn stiffness(
    name: &str,
    iter_tol: f64,
    label: &str,
    shape: &ResponseShape,
    solve: impl Fn(f64) -> (Resp, conditioning::Conditioning, f64),
) -> u64 {
    let (base, cond, _) = solve(1.0);
    generated::validate_response(name, &base, shape).unwrap();
    stiffness_witness(name, &base);
    let mut compared = 0;
    for factor in [0.25, 4.0] {
        let (got, other, floor) = solve(factor);
        generated::validate_response(name, &got, shape).unwrap();
        stiffness_witness(name, &got);
        let cond = cond.worst(&other);
        let rel = checks2::rel_for(name, iter_tol, &cond);
        assert!(
            rel <= conditioning::INCONCLUSIVE,
            "{label} {name}: inconclusive stiffness comparison"
        );
        compare_with_floor(
            &got.flat(),
            &expected(name, &base, factor).flat(),
            cond.lchar,
            rel,
            floor,
        )
        .unwrap_or_else(|e| panic!("{label} {name} E×{factor}: {e}"));
        compared += 1;
    }
    compared
}

fn wanted(only: Option<&str>) -> Vec<&'static str> {
    let mut wanted: Vec<_> = PRIORITY
        .iter()
        .copied()
        .filter(|name| selected(name, only))
        .collect();
    wanted.sort_unstable();
    wanted
}

fn check2(c: &Case2, only: Option<&str>) -> u64 {
    let analyses: Vec<_> = ana2::rows()
        .into_iter()
        .filter(|a| selected(a.name, only))
        .collect();
    let mut names: Vec<_> = analyses.iter().map(|a| a.name).collect();
    names.sort_unstable();
    assert_eq!(names, wanted(only), "missing or duplicate priority adapter");
    let mut compared = 0;
    for a in analyses {
        let t = Tally::default();
        let inv = invariants(a.name, false);
        checks2::check_case(
            &checks2::Ctx {
                tally: &t,
                rng_seed: crate::seed(),
            },
            c,
            std::slice::from_ref(&a),
            &inv,
        );
        covered(&t, a.name, &inv);
        compared += inv.len() as u64;
        if STIFFNESS.contains(&a.name) {
            compared += stiffness(
                a.name,
                a.iter_tol,
                &c.name,
                &ResponseShape::of_2d(c),
                |factor| {
                    let mut tc = c.clone();
                    for m in tc.s.materials.values_mut() {
                        m.e *= factor;
                    }
                    let cond = conditioning::of_2d(&tc.s).unwrap();
                    let floor = checks2::load_floor_2d(&tc.s, cond.lchar);
                    ((a.run)(&tc).unwrap(), cond, floor)
                },
            );
        }
    }
    compared
}

fn check3(c: &Case3, only: Option<&str>) -> u64 {
    let analyses: Vec<_> = ana3::rows()
        .into_iter()
        .filter(|a| selected(a.name, only))
        .collect();
    let mut names: Vec<_> = analyses.iter().map(|a| a.name).collect();
    names.sort_unstable();
    assert_eq!(names, wanted(only), "missing or duplicate priority adapter");
    let mut compared = 0;
    for a in analyses {
        let t = Tally::default();
        let inv = invariants(a.name, true);
        checks3::check_case(
            &checks3::Ctx {
                tally: &t,
                rng_seed: crate::seed(),
            },
            c,
            std::slice::from_ref(&a),
            &inv,
        );
        covered(&t, a.name, &inv);
        compared += inv.len() as u64;
        if STIFFNESS.contains(&a.name) {
            compared += stiffness(
                a.name,
                a.iter_tol,
                &c.name,
                &ResponseShape::of_3d(c),
                |factor| {
                    let mut tc = c.clone();
                    for m in tc.s.materials.values_mut() {
                        m.e *= factor;
                    }
                    let cond = conditioning::of_3d(&tc.s).unwrap();
                    let floor = checks3::load_floor_3d(&tc.s, cond.lchar);
                    ((a.run)(&tc).unwrap(), cond, floor)
                },
            );
        }
    }
    compared
}

fn selected(name: &str, only: Option<&str>) -> bool {
    PRIORITY.contains(&name) && only.map_or(true, |wanted| name == wanted)
}

const STIFFNESS: &[&str] = &["linear", "modal", "buckling", "plastic collapse"];

fn expected_comparisons(count: u64, only: Option<&str>) -> u64 {
    let geometric_per_seed: usize = wanted(only)
        .iter()
        .map(|name| invariants(name, false).len() + invariants(name, true).len())
        .sum();
    let portal_geometry: usize = wanted(only)
        .iter()
        .map(|name| invariants(name, false).len())
        .sum();
    let stiffness_per_dimension =
        STIFFNESS.iter().filter(|name| selected(name, only)).count() as u64 * 2;
    count * (geometric_per_seed as u64 + 2 * stiffness_per_dimension)
        + portal_geometry as u64
        + stiffness_per_dimension
}

fn sweep(count: u64, only: Option<&str>) {
    if let Some(name) = only {
        assert!(
            PRIORITY.contains(&name),
            "METAMORPHIC_ONLY={name:?} selects no priority analysis; the priority sweep would run nothing"
        );
    }
    let _strict = generated::Strict::enter();
    let mut compared = 0;
    for k in 0..count {
        let seed = crate::seed().wrapping_add(k);
        compared += check2(
            &Case2::new(
                format!("stiffness/{seed}/2d"),
                serde_json::from_value(generated::model(seed, false)).unwrap(),
            ),
            only,
        );
        compared += check3(
            &Case3::new(
                format!("stiffness/{seed}/3d"),
                serde_json::from_value(generated::model(seed, true)).unwrap(),
            ),
            only,
        );
    }
    let s = serde_json::from_str(include_str!(
        "../fixtures/ex-frame-cirsoc-dl-case2-input.json"
    ))
    .unwrap();
    compared += check2(&Case2::new("corpus/cirsoc-portal", s), only);
    let expected = expected_comparisons(count, only);
    if only.is_none() {
        assert_eq!(
            expected,
            count * 84 + 37 + 8,
            "priority comparison plan changed"
        );
    }
    assert_eq!(compared, expected, "priority comparisons run");
    println!("priority stiffness: {count} seeds × 2 dimensions + 1 corpus portal; {compared} comparisons");
}

#[test]
fn metamorphic_fast_priority() {
    sweep(8, crate::only().as_deref());
}

#[test]
#[ignore = "exhaustive priority invariances and stiffness scaling"]
fn metamorphic_nightly_priority() {
    sweep(cases(), crate::only().as_deref());
}

#[test]
fn priority_sweep_rejects_empty_selection() {
    for only in ["spectral", "", "Linear"] {
        let failure = std::panic::catch_unwind(|| sweep(1, Some(only)))
            .expect_err("priority sweep accepted a selection that runs nothing");
        let message = failure.downcast_ref::<String>().unwrap();
        assert!(
            message.contains("selects no priority analysis"),
            "unexpected rejection: {message}"
        );
    }
}

#[test]
fn stiffness_rejects_nonpositive_factors() {
    let _strict = generated::Strict::enter();
    let c2 = Case2::new(
        "faulty stiffness",
        serde_json::from_value(generated::model(1, false)).unwrap(),
    );
    let c3 = Case3::new(
        "faulty stiffness",
        serde_json::from_value(generated::model(1, true)).unwrap(),
    );
    let responses = ana2::rows()
        .into_iter()
        .filter(|a| ["modal", "buckling", "plastic collapse"].contains(&a.name))
        .map(|a| {
            (
                a.name,
                a.iter_tol,
                ResponseShape::of_2d(&c2),
                (a.run)(&c2).unwrap(),
                conditioning::of_2d(&c2.s).unwrap(),
            )
        })
        .chain(
            ana3::rows()
                .into_iter()
                .filter(|a| ["modal", "buckling", "plastic collapse"].contains(&a.name))
                .map(|a| {
                    (
                        a.name,
                        a.iter_tol,
                        ResponseShape::of_3d(&c3),
                        (a.run)(&c3).unwrap(),
                        conditioning::of_3d(&c3.s).unwrap(),
                    )
                }),
        );
    let mut tested = std::collections::BTreeMap::new();
    for (name, tol, shape, response, cond) in responses {
        let tags: Vec<_> = response
            .0
            .iter()
            .filter(|i| factor_tag(name, &i.tag))
            .map(|i| i.tag.clone())
            .collect();
        *tested.entry(name).or_insert(0) += tags.len();
        for tag in &tags {
            for value in [0.0, -1.0] {
                let mut faulty = response.clone();
                faulty
                    .0
                    .iter_mut()
                    .find(|i| &i.tag == tag)
                    .unwrap()
                    .v
                    .fill(value);
                let witness = format!("{name} {tag} must be positive");
                let failure = std::panic::catch_unwind(|| stiffness_witness(name, &faulty))
                    .expect_err("witness accepted nonpositive factor");
                assert_eq!(failure.downcast_ref::<String>(), Some(&witness));
                let validator =
                    format!("{name}: mass/frequency must be positive and modes ordered");
                for faulty_scale in [1.0, 0.25, 4.0] {
                    let failure = std::panic::catch_unwind(|| {
                        stiffness(name, tol, "faulty adapter", &shape, |scale| {
                            let mut got = expected(name, &response, scale);
                            if scale == faulty_scale {
                                got.0
                                    .iter_mut()
                                    .find(|i| &i.tag == tag)
                                    .unwrap()
                                    .v
                                    .fill(value);
                            }
                            if name == "modal" {
                                let mut frequencies: Vec<_> = got
                                    .0
                                    .iter()
                                    .filter_map(|i| {
                                        crate::response::frequency_index(&i.tag)
                                            .map(|k| (k, i.v[0]))
                                    })
                                    .collect();
                                frequencies.sort_by_key(|(k, _)| *k);
                                assert!(frequencies.iter().enumerate().all(|(n, (k, _))| n == *k));
                                got.0.retain(|i| {
                                    i.tag.strip_prefix("meff").map_or(true, |k| {
                                        let k: usize = k.parse().unwrap();
                                        frequencies.get(k + 1).is_some_and(|upper| {
                                            crate::response::modal_gap(frequencies[k].1, upper.1)
                                        })
                                    })
                                });
                            }
                            (got, cond.clone(), 0.0)
                        })
                    })
                    .expect_err("accepted nonpositive factor");
                    let message = failure.downcast_ref::<String>().unwrap();
                    assert!(
                        message == &witness || (name == "modal" && message.contains(&validator)),
                        "unexpected rejection: {message}"
                    );
                }
            }
        }
    }
    assert_eq!(
        tested,
        [("buckling", 6), ("modal", 12), ("plastic collapse", 2)].into()
    );
}

#[test]
fn priority_selection_honors_only() {
    for only in PRIORITY.iter().copied().chain(["spectral"]) {
        let names: Vec<_> = PRIORITY
            .iter()
            .copied()
            .filter(|name| selected(name, Some(only)))
            .collect();
        assert_eq!(
            names,
            if only == "spectral" {
                vec![]
            } else {
                vec![only]
            }
        );
    }
    assert!(PRIORITY.iter().all(|name| selected(name, None)));
}

#[test]
fn stiffness_preserves_mass_floors_and_rejects_mass_scaling() {
    let _strict = generated::Strict::enter();
    let c2 = Case2::new(
        "mass mutation",
        serde_json::from_value(generated::model(1, false)).unwrap(),
    );
    let c3 = Case3::new(
        "mass mutation",
        serde_json::from_value(generated::model(1, true)).unwrap(),
    );
    let a2 = ana2::rows()
        .into_iter()
        .find(|a| a.name == "modal")
        .unwrap();
    let a3 = ana3::rows()
        .into_iter()
        .find(|a| a.name == "modal")
        .unwrap();
    for (base, shape, cond, tol) in [
        (
            (a2.run)(&c2).unwrap(),
            ResponseShape::of_2d(&c2),
            conditioning::of_2d(&c2.s).unwrap(),
            a2.iter_tol,
        ),
        (
            (a3.run)(&c3).unwrap(),
            ResponseShape::of_3d(&c3),
            conditioning::of_3d(&c3.s).unwrap(),
            a3.iter_tol,
        ),
    ] {
        for factor in [0.25, 4.0] {
            let scaled = expected("modal", &base, factor);
            let mut tensors = 0;
            for (a, b) in base.0.iter().zip(&scaled.0) {
                if a.tag == "total_mass" || a.tag.starts_with("meff") {
                    assert_eq!(a.v, b.v);
                    assert_eq!(a.floor, b.floor);
                    if a.tag.starts_with("meff") {
                        tensors += 1;
                        assert!(a.floor > 0.0);
                    }
                }
            }
            assert!(tensors > 0);
            let result = std::panic::catch_unwind(|| {
                stiffness("modal", tol, "mass mutation", &shape, |scale| {
                    let mut got = expected("modal", &base, scale);
                    if scale == factor {
                        for i in got.0.iter_mut().filter(|i| i.tag.starts_with("meff")) {
                            for v in &mut i.v {
                                *v *= scale;
                            }
                        }
                    }
                    (got, cond.clone(), 0.0)
                })
            });
            assert!(
                result.is_err(),
                "accepted effective-mass scaling at E×{factor}"
            );
        }
    }
}
