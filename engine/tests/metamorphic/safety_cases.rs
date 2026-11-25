use crate::{
    ana2, ana3, checks2, checks3,
    corpus::{self, Tier},
    tally::Tally,
};

#[test]
#[ignore = "withheld by PL-2D-INVARIANCE; #1447's limit analysis is checked by issue_758_*"]
fn plastic_rigid_link_invariance() {
    plastic_rigid_link_cases(false);
}

#[test]
fn plastic_rigid_link_cases_are_refused_under_every_transform_758() {
    plastic_rigid_link_cases(true);
}

fn plastic_rigid_link_cases(refused: bool) {
    let names = [
        "feature_matrix/2d-constraint--rigid-link--offset-beam-with",
        "fuzz_rich_2d/20840",
        "fuzz_rich_2d/20832",
        "fuzz_rich_2d/20772",
        "fuzz_rich_2d/20843",
    ];
    let cases: Vec<_> = corpus::cases_2d(Tier::Nightly, 20754)
        .into_iter()
        .filter(|c| names.contains(&c.name.as_str()))
        .collect();
    assert_eq!(cases.len(), names.len());
    let a: Vec<_> = ana2::rows()
        .into_iter()
        .filter(|a| a.name == "plastic collapse")
        .collect();
    assert_eq!(a.len(), 1, "expected exactly one plastic collapse adapter");
    let invariants = ["rotation", "mirror", "relabel", "reversal", "units", "superposition"];
    for c in cases {
        let t = Tally::default();
        checks2::check_case(
            &checks2::Ctx {
                tally: &t,
                rng_seed: 20754,
            },
            &c,
            &a,
            &invariants,
        );
        assert_plastic_coverage(&t, &c.name, &invariants, refused);
        crate::finish("safety_758", &t);
    }
}

fn assert_plastic_coverage(t: &Tally, case: &str, invariants: &[&str], refused: bool) {
    let cells = t.cells.lock().unwrap();
    for &inv in invariants {
        let cell = cells
            .get(&("plastic collapse".to_string(), inv.to_string()))
            .cloned()
            .unwrap_or_default();
        let (pass, same_refusal) = if refused { (0, 1) } else { (1, 0) };
        assert!(
            cell.pass == pass
                && cell.same_refusal == same_refusal
                && cell.refused == 0
                && cell.unrep == 0
                && cell.inconclusive == 0
                && cell.ignored.is_empty()
                && cell.fails.is_empty(),
            "{case}: plastic collapse × {inv}: expected one comparison {}, got {cell:?}",
            if refused { "returning the same refusal" } else { "agreeing" }
        );
    }
}

#[test]
fn plastic_coverage_rejects_missing_or_unsuccessful_comparisons() {
    use crate::tally::Verdict;

    for (refused, accepted, rejected) in [(false, Verdict::Pass(0.0), Verdict::SameRefusal), (true, Verdict::SameRefusal, Verdict::Pass(0.0))] {
        for verdict in [
            None,
            Some(Verdict::NotApplicable),
            Some(Verdict::Refused("baseline refused".into())),
            Some(Verdict::Unrepresentable("transform unavailable".into())),
            Some(Verdict::Inconclusive(1.0)),
            Some(Verdict::Ignored("safety #758")),
            Some(Verdict::Fail("invariance violated".into())),
            Some(rejected),
        ] {
            let t = Tally::default();
            if let Some(verdict) = verdict {
                t.record("plastic collapse", "rotation", "case", verdict);
            }
            assert!(std::panic::catch_unwind(|| {
                assert_plastic_coverage(&t, "case", &["rotation"], refused);
            })
            .is_err());
        }
        let t = Tally::default();
        t.record("plastic collapse", "rotation", "case", accepted);
        assert_plastic_coverage(&t, "case", &["rotation"], refused);
    }
}

#[test]
fn modal_warping_orthogonality() {
    let c = corpus::cases_3d(Tier::Nightly, 20754)
        .into_iter()
        .find(|c| c.name == "feature_matrix/3d-warping-torsion-restrained-cantilever-with")
        .unwrap();
    let a: Vec<_> = ana3::rows()
        .into_iter()
        .filter(|a| a.name == "modal")
        .collect();
    let t = Tally::default();
    checks3::check_case(
        &checks3::Ctx {
            tally: &t,
            rng_seed: 20754,
        },
        &c,
        &a,
        &["modal orthogonality"],
    );
    assert_eq!(
        t.symbol("modal", "modal orthogonality"),
        "✓",
        "{}",
        t.report()
    );
}

fn assert_prescribed_motion_refusal(error: &str) {
    let error: serde_json::Value = serde_json::from_str(error).unwrap();
    let ds = error["structuredDiagnostics"].as_array().unwrap();
    assert_eq!(ds.len(), 1);
    assert_eq!(ds[0]["code"], "unsupported_feature");
    assert_eq!(ds[0]["severity"], "error");
    assert_eq!(ds[0]["phase"], "input");
    assert!(error["message"].as_str().unwrap().contains("prescribed support displacements"));
}

#[test]
fn time_history_reciprocity() {
    let mut c = corpus::cases_2d(Tier::Nightly, 20754)
        .into_iter()
        .find(|c| c.name == "fuzz_rich_2d/20843")
        .unwrap();
    let a: Vec<_> = ana2::rows()
        .into_iter()
        .filter(|a| a.name == "time history")
        .collect();
    assert_prescribed_motion_refusal(&(a[0].run)(&c).unwrap_err());
    for support in c.s.supports.values_mut() {
        support.dx = None; support.dz = None; support.dry = None;
    }
    let t = Tally::default();
    checks2::check_case(
        &checks2::Ctx {
            tally: &t,
            rng_seed: 20754,
        },
        &c,
        &a,
        crate::INV_2D,
    );
    assert_eq!(
        t.symbol("time history", "reciprocity"),
        "✓",
        "{}",
        t.report()
    );
}

#[test]
fn issue_760_seed_20827_time_history_is_reciprocal() {
    let a: Vec<_> = ana2::rows().into_iter().filter(|a| a.name == "time history").collect();
    let c = corpus::cases_2d(Tier::Nightly, 20754).into_iter()
        .find(|c| c.name == "fuzz_rich_2d/20827").unwrap();
    let t = Tally::default();
    checks2::check_case(&checks2::Ctx { tally: &t, rng_seed: 20754 }, &c, &a, &["reciprocity"]);
    let cells = t.cells.lock().unwrap();
    let cell = &cells[&("time history".into(), "reciprocity".into())];
    assert_eq!(cell.pass, 1, "{cell:?}");
    assert_eq!(cell.refused + cell.same_refusal + cell.unrep + cell.inconclusive, 0, "{cell:?}");
    assert!(cell.fails.is_empty() && cell.ignored.is_empty(), "{cell:?}");
}

#[test]
fn issue_760_seed_20780_refuses_combined_singular_mass() {
    let a = ana3::rows().into_iter().find(|a| a.name == "time history").unwrap();
    let mut c = corpus::cases_3d(Tier::Nightly, 20754).into_iter()
        .find(|c| c.name == "fuzz_rich_3d/20780").unwrap();
    assert_prescribed_motion_refusal(&(a.run)(&c).unwrap_err());
    for support in c.s.supports.values_mut() {
        support.dx = None; support.dy = None; support.dz = None;
        support.drx = None; support.dry = None; support.drz = None;
    }
    let error = (a.run)(&c).unwrap_err();
    let code = dedaliano_engine::solver::time_integration::MASS_SINGULAR;
    assert!(error.starts_with(&format!("{code}:")), "{}: {error}", c.name);
}

const ISSUE_762_CORPUS: u64 = 20754;

fn issue_762_units() -> [dedaliano_engine::metamorphic::units::Units; 4] {
    use dedaliano_engine::metamorphic::units::Units;
    [(0.001, 1000.0), (25.0, 0.01), (0.3048, 4.448), (1000.0, 1000.0)]
        .map(|(length, force)| Units::froude(length, force))
}

fn issue_762_static_path(name: &str) -> bool {
    name.starts_with("linear") || matches!(name, "constrained" | "certified linear" | "load combinations")
}

fn issue_762_refusal(error: &str) -> &str {
    error.strip_prefix("Failed to solve case 'A': ").unwrap_or(error)
}

#[test]
fn issue_762_2d_refuses_reported_unreliable_models_in_equivalent_frames() {
    use dedaliano_engine::metamorphic::transform::Iso2;

    let analyses: Vec<_> = ana2::rows().into_iter().filter(|a| issue_762_static_path(a.name)).collect();
    for seed in [20756, 20795, 20800, 20806, 20824, 20833, 20865] {
        let case = corpus::fuzz_case_2d(ISSUE_762_CORPUS, seed - ISSUE_762_CORPUS);
        let mut copies = vec![("original".into(), case.clone())];
        for units in issue_762_units() {
            copies.push((format!("units {}/{}", units.length, units.force), case.units(&units)));
        }
        for (label, iso) in [
            ("quarter turn", Iso2::rotation(std::f64::consts::FRAC_PI_2)),
            ("mirror", Iso2::mirror_x()),
        ] {
            copies.push((label.into(), case.iso(&iso).unwrap()));
        }
        if !matches!(seed, 20795 | 20833 | 20865) {
            copies.push(("skew rotation".into(), case.iso(&Iso2::rotation(0.37)).unwrap()));
        }

        for (label, copy) in copies {
            for analysis in &analyses {
                let context = format!("{} {label} {}", copy.name, analysis.name);
                let error = (analysis.run)(&copy).expect_err(&context);
                let reason = issue_762_refusal(&error);
                if seed == 20865 {
                    crate::common::assert_support_conflict(reason);
                } else if analysis.name == "linear (dense reference)" && !copy.s.constraints.is_empty() {
                    assert!(reason.starts_with("prepared static solve does not support constraints"), "{context}: {reason}");
                } else {
                    let matches = match seed {
                        20756 | 20795 => reason.contains("constraint reduction cancels stiffness contributions"),
                        20824 => reason.contains("the matrix exceeds a conditioning limit or the recovered response fails its accuracy check")
                            || reason.starts_with("the structure cannot be solved reliably: stiffness factorization accuracy is unresolved after the stability check;"),
                        _ => reason.starts_with("the structure is a mechanism at nodes [3]: a node can move freely"),
                    };
                    assert!(matches, "{context}: {reason}");
                }
            }
        }
    }
}

#[test]
fn issue_762_3d_refuses_reported_mechanisms_in_equivalent_frames() {
    use dedaliano_engine::metamorphic::{reversal::reverse_3d, transform::Iso3};

    let analyses: Vec<_> = ana3::rows().into_iter().filter(|a| issue_762_static_path(a.name)).collect();
    for seed in [20761, 20788] {
        let case = corpus::fuzz_case_3d(ISSUE_762_CORPUS, seed - ISSUE_762_CORPUS);
        let reversed = crate::case::Case3 { s: reverse_3d(&case.s, &|_| true).unwrap(), ..case.clone() };
        let mut copies = vec![
            ("original".into(), case.clone()),
            ("axis permutation".into(), case.iso(&Iso3::axis_permutation(1)).unwrap()),
            ("member reversal".into(), reversed),
        ];
        if seed == 20761 {
            copies.push(("mirror".into(), case.mirror(0, [0.0; 3]).unwrap()));
            copies.push(("skew rotation".into(), case.iso(&Iso3::about_z(0.37)).unwrap()));
        }
        for units in issue_762_units() {
            copies.push((format!("units {}/{}", units.length, units.force), case.units(&units)));
        }

        for (label, copy) in copies {
            for analysis in &analyses {
                let context = format!("{} {label} {}", copy.name, analysis.name);
                let error = (analysis.run)(&copy).expect_err(&context);
                let reason = issue_762_refusal(&error);
                if seed == 20761 {
                    assert!(reason.starts_with("Nodal moment at node 2 is not supported:")
                        && reason.contains("loaded released rotation"), "{context}: {reason}");
                } else {
                    assert!(reason.starts_with("the structure is a mechanism at nodes [3]: a node can move freely"), "{context}: {reason}");
                }
            }
        }
    }
}

#[test]
fn issue_762_seed_20840_agrees_with_physical_reference_and_preserves_invariance() {
    use crate::response::{Dim, Kind, Resp};
    use dedaliano_engine::metamorphic::{conditioning, transform::Iso2};

    let case = corpus::fuzz_case_2d(ISSUE_762_CORPUS, 20840 - ISSUE_762_CORPUS);
    let mut expected = Resp::default();
    for (id, ux, uz, ry) in [
        (1, 0.0, 0.0, 0.0),
        (2, -1.3772993952784738, -1.900261023004616, 0.316687849249401),
        (3, 0.3454848294796218, 0.3411836055644066, 0.316687849249401),
        (4, -3.6493716248418354, -2.9717154581410382, 0.3251711806559395),
        (5, -3.0027603426348232, -2.059522956805617, 0.3251711806559395),
    ] {
        expected.push(Some(id), None, "u", Kind::V2(Dim::LEN), vec![ux, uz]);
        expected.push(Some(id), None, "ry", Kind::P2(Dim::NONE), vec![ry]);
    }
    expected.push(Some(1), None, "R", Kind::V2(Dim::FORCE), vec![24.57768118783663, 11.58952776957052]);
    expected.push(Some(1), None, "RM", Kind::P2(Dim::MOMENT), vec![-370.4975683778451]);

    let mut copies = vec![("original".into(), case.clone(), expected.clone())];
    for units in issue_762_units() {
        copies.push((format!("units {}/{}", units.length, units.force), case.units(&units), expected.units(&units)));
    }
    for (label, iso) in [
        ("quarter turn", Iso2::rotation(std::f64::consts::FRAC_PI_2)),
        ("skew rotation", Iso2::rotation(0.37)),
        ("mirror", Iso2::mirror_x()),
    ] {
        copies.push((label.into(), case.iso(&iso).unwrap(), expected.iso2(&iso).unwrap()));
    }

    let analyses: Vec<_> = ana2::rows().into_iter().filter(|a| issue_762_static_path(a.name)
        && a.name != "linear (dense reference)").collect();
    for (label, copy, expected) in copies {
        let cond = conditioning::of_2d(&copy.s).unwrap();
        let floor = checks2::load_floor_2d(&copy.s, cond.lchar);
        for analysis in &analyses {
            let context = format!("{} {label} {}", copy.name, analysis.name);
            let actual = (analysis.run)(&copy).unwrap_or_else(|e| panic!("{context}: {e}"));
            let actual = actual.common(&expected);
            assert_eq!(actual.0.len(), expected.0.len(), "{context}");
            let rel = checks2::rel_for(analysis.name, analysis.iter_tol, &cond);
            crate::analysis_accuracy::compare(&actual, &expected, cond.lchar, rel, floor, [0.0; 2])
                .unwrap_or_else(|e| panic!("{context}: {e}"));
        }
    }

    let tally = Tally::default();
    checks2::check_case(
        &checks2::Ctx { tally: &tally, rng_seed: ISSUE_762_CORPUS },
        &case,
        &analyses,
        &["rotation", "mirror", "units", "linear agreement", "energy"],
    );
    for analysis in &analyses {
        for invariant in ["rotation", "mirror", "units", "energy"] {
            assert_eq!(tally.symbol(analysis.name, invariant), "✓", "{}", tally.report());
        }
        if analysis.name != "linear" {
            assert_eq!(tally.symbol(analysis.name, "linear agreement"), "✓", "{}", tally.report());
        }
    }
}
