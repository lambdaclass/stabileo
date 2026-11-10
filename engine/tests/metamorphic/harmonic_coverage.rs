use crate::tally::Tally;

#[test]
#[ignore]
fn seeded_harmonic_symmetry_coverage() {
    let base = 2026110200000;
    for dim in [2, 3] {
        let tally = Tally::default();
        for k in 0..200 {
            for anti in [false, true] {
                if dim == 2 {
                    let c = crate::corpus::fuzz_case_2d(base, k);
                    if let Some(sym) = crate::symmetry::symmetrize_2d(&c.name, &c.s, anti) {
                        let anas: Vec<_> = crate::ana2::rows().into_iter().filter(|a| a.name == "harmonic").collect();
                        crate::symmetry::check_2d(&tally, &sym, anti, &anas);
                    }
                } else {
                    let c = crate::corpus::fuzz_case_3d(base, k);
                    if let Some(sym) = crate::symmetry::symmetrize_3d(&c.name, &c.s, anti) {
                        let anas: Vec<_> = crate::ana3::rows().into_iter().filter(|a| a.name == "harmonic").collect();
                        crate::symmetry::check_3d(&tally, &sym, anti, &anas);
                    }
                }
            }
        }
        eprintln!("harmonic coverage dim={dim} base={base} seeds=200: {}", tally.replay_results());
    }
}
