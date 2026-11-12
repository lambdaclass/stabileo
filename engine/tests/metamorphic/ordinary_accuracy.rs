use crate::response::{Dim, Kind, Resp};
use dedaliano_engine::metamorphic::compare::{compare_compliant, Flat, Report};

fn legacy(
    got: &Resp,
    expected: &Resp,
    source: &Resp,
    lchar: f64,
    rel: f64,
    floor: f64,
    compliance: [f64; 2],
) -> Result<Report, String> {
    let errors = |r: &Resp| {
        let mut r = r.clone();
        for i in &mut r.0 {
            i.v.fill(0.0);
            i.floor = i.error;
        }
        r.flat()
    };
    let error = Flat::abs_comb(1.0, &errors(got), 1.0, &errors(expected));
    let mut scale = source.flat();
    for (s, e) in [
        (&mut scale.t, &error.t),
        (&mut scale.r, &error.r),
        (&mut scale.f, &error.f),
        (&mut scale.m, &error.m),
        (&mut scale.s, &error.s),
    ] {
        s.floor = s.floor.max(e.floor / rel);
    }
    for (s, e) in scale.x.scales.iter_mut().zip(&error.x.scales) {
        *s = s.max(e / rel);
    }
    compare_compliant(
        &got.flat(),
        &expected.flat(),
        &scale,
        lchar,
        rel,
        floor,
        compliance,
    )
}

fn kinds() -> Vec<(Kind, usize)> {
    vec![
        (Kind::V2(Dim::LEN), 2),
        (Kind::V3(Dim::LEN), 3),
        (Kind::P2(Dim::NONE), 1),
        (Kind::V3(Dim::NONE), 3),
        (Kind::V2(Dim::FORCE), 2),
        (Kind::V3(Dim::MOMENT), 3),
        (Kind::Local(Dim::NONE, false), 1),
        (Kind::Pair(Dim::MOMENT, false), 2),
        (Kind::T2(Dim::NONE), 3),
        (Kind::T3(Dim::NONE), 6),
        (Kind::Abs2(Dim::LEN), 2),
        (Kind::Abs3(Dim::LEN), 3),
        (Kind::Stress, 1),
    ]
}

#[test]
fn issue_1991_ordinary_ratios_match_the_original_budget() {
    for (kind, n) in kinds() {
        let mut expected = Resp::default();
        expected.push(None, None, "ordinary", kind.clone(), vec![1e6; n]);
        expected.0[0].error = 1e-8;
        let mut got = expected.clone();
        got.0[0].v[0] += 1e-4;
        for factor in [1.0, 2.0] {
            let source = Resp::abs_comb(factor, &expected, 0.0, &expected);
            let old = legacy(&got, &expected, &source, 1.0, 1e-9, 0.0, [0.0; 2]).unwrap();
            let new = crate::analysis_accuracy::compare_scaled(
                &got, &expected, &source, 1.0, 1e-9, 0.0, [0.0; 2],
            )
            .unwrap();
            eprintln!(
                "{kind:?} source={factor}: original={:.17e} current={:.17e}",
                old.worst, new.worst
            );
            assert_eq!(
                old.worst.to_bits(),
                new.worst.to_bits(),
                "{kind:?} source={factor}"
            );
        }
        got.0[0].v[0] += 1.0;
        assert!(legacy(&got, &expected, &expected, 1.0, 1e-9, 0.0, [0.0; 2]).is_err());
        assert!(
            crate::analysis_accuracy::compare(&got, &expected, 1.0, 1e-9, 0.0, [0.0; 2]).is_err()
        );
    }
}

#[test]
fn issue_1991_ordinary_budget_boundaries_are_not_additive() {
    for (kind, n) in kinds() {
        for combined_error in [0.5_f64, 1.0, 2.0] {
            let mut expected = Resp::default();
            expected.push(None, None, "boundary", kind.clone(), vec![8.0; n]);
            expected.0[0].error = combined_error / 2.0;
            let mut got = expected.clone();
            let allowance = combined_error.max(1.0);
            for sign in [-1.0, 1.0] {
                got.0[0].v[0] = 8.0 + sign * allowance;
                let old = legacy(&got, &expected, &expected, 1.0, 0.125, 0.0, [0.0; 2]).unwrap();
                let new =
                    crate::analysis_accuracy::compare(&got, &expected, 1.0, 0.125, 0.0, [0.0; 2])
                        .unwrap();
                assert_eq!(
                    old.worst.to_bits(),
                    new.worst.to_bits(),
                    "{kind:?} error={combined_error} sign={sign}"
                );
                got.0[0].v[0] = if sign > 0.0 {
                    got.0[0].v[0].next_up()
                } else {
                    got.0[0].v[0].next_down()
                };
                assert!(legacy(&got, &expected, &expected, 1.0, 0.125, 0.0, [0.0; 2]).is_err());
                assert!(
                    crate::analysis_accuracy::compare(&got, &expected, 1.0, 0.125, 0.0, [0.0; 2])
                        .is_err(),
                    "{kind:?} error={combined_error} sign={sign}: ordinary budget widened"
                );
            }
        }
    }
}

fn check_adapter(
    name: &str,
    mut expected: Resp,
    cond: dedaliano_engine::metamorphic::conditioning::Conditioning,
    iter_tol: f64,
    floor: f64,
) {
    for i in &mut expected.0 {
        i.error = 0.0;
    }
    let rel = crate::checks2::rel_for(name, iter_tol, &cond);
    let compliance = crate::checks2::compliance(name, &cond);
    let flat = expected.flat();
    let natural = flat
        .t
        .maxabs()
        .max(flat.r.maxabs() * cond.lchar)
        .max(floor * compliance[0]);
    let mut got = expected.clone();
    let item = got
        .0
        .iter_mut()
        .find(|i| i.tag == "u" && i.v.iter().any(|v| *v != 0.0))
        .unwrap();
    item.error = rel * natural / 32.0;
    item.v[0] += rel * natural / 4.0;
    let old = legacy(
        &got, &expected, &expected, cond.lchar, rel, floor, compliance,
    )
    .unwrap();
    let new =
        crate::analysis_accuracy::compare(&got, &expected, cond.lchar, rel, floor, compliance)
            .unwrap();
    assert!(old.worst > 0.0, "{name}: probe rounded away");
    assert_eq!(
        old.worst.to_bits(),
        new.worst.to_bits(),
        "{name}: ordinary ratio changed"
    );
    assert!(crate::analysis_accuracy::compare(
        &expected, &expected, cond.lchar, rel, floor, compliance
    )
    .is_ok());
    let item = got
        .0
        .iter_mut()
        .find(|i| i.tag == "u" && i.error > 0.0)
        .unwrap();
    item.v[0] += 4.0 * rel * natural;
    assert!(
        legacy(&got, &expected, &expected, cond.lchar, rel, floor, compliance).is_err(),
        "{name}: original missed seeded displacement fault"
    );
    assert!(
        crate::analysis_accuracy::compare(&got, &expected, cond.lchar, rel, floor, compliance)
            .is_err(),
        "{name}: current missed seeded displacement fault"
    );
}

#[test]
fn issue_1991_ordinary_ratios_through_static_and_nonlinear_adapters() {
    let c = crate::case::Case2::new(
        "ordinary cantilever",
        serde_json::from_str(include_str!("../fixtures/ex-cantilever-input.json")).unwrap(),
    );
    let wanted = |name: &str| {
        crate::analysis_accuracy::static_assembly(name)
            || [
                "P-Delta",
                "corotational",
                "material nonlinear",
                "fiber nonlinear",
            ]
            .contains(&name)
    };
    let cond = dedaliano_engine::metamorphic::conditioning::of_2d(&c.s).unwrap();
    for a in crate::ana2::rows().into_iter().filter(|a| wanted(a.name)) {
        check_adapter(
            a.name,
            (a.run)(&c).unwrap(),
            cond,
            a.iter_tol,
            crate::checks2::load_floor_2d(&c.s, cond.lchar),
        );
    }
    for plane in dedaliano_engine::metamorphic::planes::Plane::ALL {
        let c = crate::case::Case3::new(
            c.name.clone(),
            dedaliano_engine::metamorphic::planes::embed_2d(&c.s, plane).unwrap(),
        );
        let cond = dedaliano_engine::metamorphic::conditioning::of_3d(&c.s).unwrap();
        for a in crate::ana3::rows().into_iter().filter(|a| wanted(a.name)) {
            check_adapter(
                a.name,
                (a.run)(&c).unwrap(),
                cond,
                a.iter_tol,
                crate::checks3::load_floor_3d(&c.s, cond.lchar),
            );
        }
    }
}

#[test]
fn component_budget_refuses_overflow_and_mismatched_results() {
    let mut expected = Resp::default();
    expected.push(
        None,
        None,
        "boundary",
        Kind::Local(Dim::NONE, false),
        vec![0.0],
    );
    expected.0[0].error = f64::MAX / 4.0;
    let mut got = expected.clone();
    let compare = |got: &Resp, expected: &Resp| {
        crate::analysis_accuracy::compare(got, expected, 1.0, 0.5, 0.0, [0.0; 2])
    };
    compare(&got, &expected).unwrap();
    got.0[0].error = got.0[0].error.next_up();
    expected.0[0].error = expected.0[0].error.next_up();
    assert!(
        compare(&got, &expected).is_err(),
        "overflowing component scale passed"
    );
    for error in [-1.0, f64::NAN, f64::INFINITY] {
        got.0[0].error = error;
        assert!(compare(&got, &expected).is_err());
    }
    got.0[0].error = 0.0;
    expected.0[0].error = 0.0;
    got.0[0].tag = "wrong component".into();
    assert!(compare(&got, &expected).is_err());
    got.0.clear();
    assert!(compare(&got, &expected).is_err());
}

#[test]
fn ordinary_seeded_faults_are_rejected_by_both_budgets() {
    for (kind, n) in kinds() {
        let mut expected = Resp::default();
        expected.push(None, None, "ordinary", kind.clone(), vec![1e6; n]);
        expected.0[0].error = 1e-8;
        let mut got = expected.clone();
        got.0[0].v[0] += 1.0;
        assert!(
            legacy(&got, &expected, &expected, 1.0, 1e-9, 0.0, [0.0; 2]).is_err(),
            "{kind:?}: original missed seeded fault"
        );
        assert!(
            crate::analysis_accuracy::compare(&got, &expected, 1.0, 1e-9, 0.0, [0.0; 2]).is_err(),
            "{kind:?}: current missed seeded fault"
        );
    }
}
