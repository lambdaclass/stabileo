use crate::tally::Tally;

#[test]
#[ignore]
fn seeded_harmonic_symmetry_coverage() {
    let base = 2026110200000;
    for dim in [2, 3] {
        let tally = Tally::default();
        let mut inconclusive = 0;
        for k in 0..200 {
            for anti in [false, true] {
                if dim == 2 {
                    let c = crate::corpus::fuzz_case_2d(base, k);
                    if let Some(sym) = crate::symmetry::symmetrize_2d(&c.name, &c.s, anti) {
                        let anas: Vec<_> = crate::ana2::rows()
                            .into_iter()
                            .filter(|a| a.name == "harmonic")
                            .collect();
                        crate::symmetry::check_2d(&tally, &sym, anti, &anas);
                    }
                } else {
                    let c = crate::corpus::fuzz_case_3d(base, k);
                    if let Some(sym) = crate::symmetry::symmetrize_3d(&c.name, &c.s, anti) {
                        let anas: Vec<_> = crate::ana3::rows()
                            .into_iter()
                            .filter(|a| a.name == "harmonic")
                            .collect();
                        crate::symmetry::check_3d(&tally, &sym, anti, &anas);
                    }
                }
                let count = tally
                    .cells
                    .lock()
                    .unwrap()
                    .values()
                    .map(|c| c.inconclusive)
                    .sum::<usize>();
                if count > inconclusive {
                    eprintln!("inconclusive dim={dim} seed={} anti={anti}", base + k);
                    inconclusive = count;
                }
            }
        }
        eprintln!(
            "harmonic coverage dim={dim} base={base} seeds=200: {}",
            tally.replay_results()
        );
        let cells = tally.cells.lock().unwrap();
        let c = &cells[&("harmonic".into(), "symmetry".into())];
        assert!(c.fails.is_empty(), "{c:?}");
        assert_eq!(
            (c.pass, c.inconclusive, c.refused),
            if dim == 2 { (28, 4, 200) } else { (2, 0, 25) }
        );
    }
}

#[test]
#[ignore]
fn seeded_supported_harmonic_symmetry_coverage() {
    let base = 2026110200000;
    for dim in [2, 3] {
        let tally = Tally::default();
        let issues: &[u32] = if dim == 2 {
            &[1203, 1278, 1464]
        } else {
            &[1209, 1215, 1218, 1281]
        };
        for k in 0..200 {
            let seed = base + k;
            let mut rng = dedaliano_engine::metamorphic::Rng::new(seed);
            let stiffness = rng.range(0.5, 2.0);
            let issue = issues[k as usize % issues.len()];
            let text = std::fs::read_to_string(
                crate::corpus::root()
                    .join(format!("metamorphic_corpus/nightly/issue-{issue}.json")),
            )
            .unwrap();
            let model = crate::corpus::parse(&text).unwrap();
            let frequencies = vec![0.0, rng.range(0.25, 4.0), rng.range(0.25, 4.0)];
            match model {
                crate::corpus::Model::D2(mut s) => {
                    for m in s.materials.values_mut() {
                        m.e *= stiffness;
                    }
                    let anas: Vec<_> = crate::ana2::rows()
                        .into_iter()
                        .filter(|a| a.name == "harmonic")
                        .collect();
                    for anti in [false, true] {
                        let mut sym = crate::symmetry::symmetrize_2d(
                            &format!("supported/{seed}/issue-{issue}"),
                            &s,
                            anti,
                        )
                        .unwrap();
                        sym.case.p.freqs = frequencies.clone();
                        crate::symmetry::check_2d(&tally, &sym, anti, &anas);
                    }
                }
                crate::corpus::Model::D3(mut s) => {
                    for m in s.materials.values_mut() {
                        m.e *= stiffness;
                    }
                    let anas: Vec<_> = crate::ana3::rows()
                        .into_iter()
                        .filter(|a| a.name == "harmonic")
                        .collect();
                    for anti in [false, true] {
                        let mut sym = crate::symmetry::symmetrize_3d(
                            &format!("supported/{seed}/issue-{issue}"),
                            &s,
                            anti,
                        )
                        .unwrap();
                        sym.case.p.freqs = frequencies.clone();
                        crate::symmetry::check_3d(&tally, &sym, anti, &anas);
                    }
                }
            }
        }
        eprintln!(
            "supported harmonic coverage dim={dim} base={base} seeds=200: {}",
            tally.replay_results()
        );
        let cells = tally.cells.lock().unwrap();
        let c = &cells[&("harmonic".into(), "symmetry".into())];
        assert!(c.fails.is_empty(), "{c:?}");
        assert_eq!((c.pass, c.inconclusive, c.refused), (400, 0, 0), "{c:?}");
    }
}
