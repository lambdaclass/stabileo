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
            "buckling" => factor,
            _ => 1.0, // reactions, forces, masses and plastic capacity unchanged
        };
        for v in &mut item.v {
            *v *= scale;
        }
        item.floor *= scale;
    }
    out
}

fn stiffness_witness(name: &str, r: &Resp) {
    if name == "linear" {
        assert!(r
            .0
            .iter()
            .any(|i| i.tag == "u" && i.v.iter().any(|v| v.abs() > 0.0)));
    } else {
        let tags: Vec<String> = match name {
            "modal" => (0..6).map(|k| format!("f{k:02}")).collect(),
            "buckling" => (0..3).map(|k| format!("lambda{k}")).collect(),
            "plastic collapse" => vec!["collapse_factor".into()],
            _ => unreachable!(),
        };
        for tag in tags {
            let item = r.0.iter().find(|i| i.tag == tag).unwrap();
            assert!(
                item.v.iter().all(|v| v.is_finite() && *v > 0.0),
                "{name} {tag} must be positive"
            );
        }
    }
}

fn stiffness(
    name: &str,
    iter_tol: f64,
    label: &str,
    shape: &ResponseShape,
    solve: impl Fn(f64) -> (Resp, conditioning::Conditioning, f64),
) {
    let (base, cond, _) = solve(1.0);
    generated::validate_response(name, &base, shape).unwrap();
    stiffness_witness(name, &base);
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
    }
}

fn check2(c: &Case2, geometry: bool) {
    let analyses: Vec<_> = ana2::rows()
        .into_iter()
        .filter(|a| PRIORITY.contains(&a.name))
        .collect();
    let mut names: Vec<_> = analyses.iter().map(|a| a.name).collect();
    names.sort_unstable();
    let mut wanted = PRIORITY.to_vec();
    wanted.sort_unstable();
    assert_eq!(names, wanted, "missing or duplicate priority adapter");
    for a in analyses {
        if geometry {
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
        }
        if ["linear", "modal", "buckling", "plastic collapse"].contains(&a.name) {
            stiffness(
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
}

fn check3(c: &Case3) {
    let analyses: Vec<_> = ana3::rows()
        .into_iter()
        .filter(|a| PRIORITY.contains(&a.name))
        .collect();
    let mut names: Vec<_> = analyses.iter().map(|a| a.name).collect();
    names.sort_unstable();
    let mut wanted = PRIORITY.to_vec();
    wanted.sort_unstable();
    assert_eq!(names, wanted, "missing or duplicate priority adapter");
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
        if ["linear", "modal", "buckling", "plastic collapse"].contains(&a.name) {
            stiffness(
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
}

fn sweep(count: u64) {
    let _strict = generated::Strict::enter();
    for k in 0..count {
        let seed = crate::seed().wrapping_add(k);
        check2(
            &Case2::new(
                format!("stiffness/{seed}/2d"),
                serde_json::from_value(generated::model(seed, false)).unwrap(),
            ),
            true,
        );
        check3(&Case3::new(
            format!("stiffness/{seed}/3d"),
            serde_json::from_value(generated::model(seed, true)).unwrap(),
        ));
    }
    // Existing symmetric portal corpus: redundant load paths, distributed load,
    // and simultaneous plastic hinges complement the generated cantilevers.
    let s = serde_json::from_str(include_str!(
        "../fixtures/ex-frame-cirsoc-dl-case2-input.json"
    ))
    .unwrap();
    check2(&Case2::new("corpus/cirsoc-portal", s), false);
    let geometric_per_seed: usize = PRIORITY
        .iter()
        .map(|name| invariants(name, false).len() + invariants(name, true).len())
        .sum();
    let comparisons = count * (geometric_per_seed as u64 + 16) + 8;
    println!("priority stiffness: {count} seeds × 2 dimensions + 1 corpus portal; {comparisons} comparisons");
}

#[test]
fn metamorphic_fast_priority() {
    sweep(8);
}

#[test]
#[ignore = "exhaustive priority invariances and stiffness scaling"]
fn metamorphic_nightly_priority() {
    sweep(cases());
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
    for (name, tol, shape, response, cond) in responses {
        for tag in response
            .0
            .iter()
            .filter(|i| {
                i.tag.starts_with('f') || i.tag.starts_with("lambda") || i.tag == "collapse_factor"
            })
            .map(|i| &i.tag)
        {
            for value in [0.0, -1.0] {
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
                                let frequencies: Vec<_> = (0..6)
                                    .map(|k| {
                                        got.0
                                            .iter()
                                            .find(|i| i.tag == format!("f{k:02}"))
                                            .unwrap()
                                            .v[0]
                                    })
                                    .collect();
                                got.0.retain(|i| {
                                    i.tag.strip_prefix("meff").map_or(true, |k| {
                                        let k: usize = k.parse().unwrap();
                                        frequencies[k + 1] > frequencies[k] * (1.0 + 1e-3)
                                    })
                                });
                            }
                            generated::validate_response(name, &got, &shape).unwrap();
                            (got, cond.clone(), 0.0)
                        })
                    })
                    .expect_err("accepted nonpositive factor");
                    let message = failure.downcast_ref::<String>().unwrap();
                    assert!(
                        message.contains("must be positive"),
                        "unexpected rejection: {message}"
                    );
                }
            }
        }
    }
}
