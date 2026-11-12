use crate::case::Case2;
use crate::tally::Tally;

pub fn witness(issue: u32) -> Case2 {
    Case2::new("replay", serde_json::from_str(if issue == 1970 { include_str!("../metamorphic_corpus/nightly/issue-1970.json") } else { include_str!("../metamorphic_corpus/nightly/issue-1971.json") }).unwrap())
}

fn replay(issue: u32, seed: u64, analysis: &str, relation: &str) {
    let c = witness(if relation == "reversal" { 1970 } else { 1971 });
    let a = crate::ana2::rows().into_iter().find(|a| a.name == analysis).unwrap();
    let t = Tally::default();
    if relation == "symmetry" {
        for anti in [false, true] {
            let sym = crate::symmetry::symmetrize_2d(&c.name, &c.s, anti).unwrap();
            crate::symmetry::check_2d(&t, &sym, anti, std::slice::from_ref(&a));
        }
    } else {
        crate::checks2::check_case(&crate::checks2::Ctx { tally: &t, rng_seed: seed }, &c, &[a], &crate::INV_2D[..4]);
    }
    let cells = t.cells.lock().unwrap();
    let cell = &cells[&(analysis.to_owned(), relation.to_owned())];
    assert!(cell.fails.is_empty(), "#{issue}: {cell:?}");
    assert_eq!(cell.pass, if relation == "symmetry" { 2 } else { 1 }, "#{issue}: {cell:?}");
}

#[test]
#[ignore = "known wrong result: #1970"]
fn issue_1970_reversal() {
    replay(1970, 2026111206980, "creep & shrinkage (t = t0)", "reversal");
}

#[test]
#[ignore = "known wrong result: #1971"]
fn issue_1971_symmetry() {
    replay(1971, 2026111203040, "creep & shrinkage (t = t0)", "symmetry");
}

#[test]
#[ignore = "known wrong result: #1972"]
fn issue_1972_symmetry() {
    replay(1972, 2026111203040, "constrained", "symmetry");
}

#[test]
#[ignore = "known wrong result: #1973"]
fn issue_1973_symmetry() {
    replay(1973, 2026111203040, "linear (WASM typed path)", "symmetry");
}

#[test]
#[ignore = "known wrong result: #1974"]
fn issue_1974_reversal() {
    replay(1974, 2026111206980, "linear (WASM typed path)", "reversal");
}

#[test]
#[ignore = "known wrong result: #1975"]
fn issue_1975_symmetry() {
    replay(1975, 2026111203040, "linear (sparse path)", "symmetry");
}

#[test]
#[ignore = "known wrong result: #1976"]
fn issue_1976_symmetry() {
    replay(1976, 2026111203040, "linear", "symmetry");
}

#[test]
#[ignore = "known wrong result: #1978"]
fn issue_1978_reversal() {
    replay(1978, 2026111206980, "linear (dense reference)", "reversal");
}

#[test]
#[ignore = "known wrong result: #1979"]
fn issue_1979_reversal() {
    replay(1979, 2026111206980, "Winkler (no foundation)", "reversal");
}

#[test]
#[ignore = "known wrong result: #1980"]
fn issue_1980_symmetry() {
    replay(1980, 2026111203040, "load combinations", "symmetry");
}

#[test]
#[ignore = "known wrong result: #1981"]
fn issue_1981_symmetry() {
    replay(1981, 2026111203040, "staged (one stage)", "symmetry");
}

#[test]
#[ignore = "known wrong result: #1982"]
fn issue_1982_symmetry() {
    replay(1982, 2026111203040, "Winkler (no foundation)", "symmetry");
}

#[test]
#[ignore = "known wrong result: #1983"]
fn issue_1983_symmetry() {
    replay(1983, 2026111203040, "staged (loads in two stages)", "symmetry");
}

#[test]
#[ignore = "known wrong result: #1984"]
fn issue_1984_symmetry() {
    replay(1984, 2026111203040, "certified linear", "symmetry");
}

#[test]
#[ignore = "known wrong result: #1985"]
fn issue_1985_symmetry() {
    replay(1985, 2026111203040, "linear (dense reference)", "symmetry");
}

fn spatial(c: &Case2) -> crate::case::Case3 {
    crate::case::Case3::new(c.name.clone(), dedaliano_engine::metamorphic::planes::embed_2d(&c.s, dedaliano_engine::metamorphic::planes::Plane::XZ).unwrap())
}

#[test]
#[ignore = "known wrong result: #1971"]
fn symmetry_geometry_is_an_exact_involution_in_both_dimensions() {
    for anti in [false, true] {
        let c = witness(1971);
        let s = crate::symmetry::symmetrize_2d(&c.name, &c.s, anti).unwrap();
        assert_eq!(s.iso.t, [0.0; 2]);
        for n in s.case.s.nodes.values() {
            let m = &s.case.s.nodes[&s.pair.node[&n.id].to_string()];
            assert_eq!(n.x, -m.x);
            assert_eq!(n.z, m.z);
        }
        let c = spatial(&c);
        let s = crate::symmetry::symmetrize_3d(&c.name, &c.s, anti).unwrap();
        assert_eq!(s.iso.t, [0.0; 3]);
        for n in s.case.s.nodes.values() {
            let m = &s.case.s.nodes[&s.pair.node[&n.id].to_string()];
            assert_eq!([n.x, n.y, n.z], [-m.x, -m.y, m.z]);
        }
    }
}

#[test]
#[ignore = "known wrong result: #1971"]
fn symmetry_only_merges_nodes_exactly_on_the_axis() {
    for x in [0.0, f64::from_bits(1), 1.0, 1.0_f64.next_down()] {
        let mut c = witness(1971);
        c.s.nodes.get_mut("1").unwrap().x = -1.0;
        c.s.nodes.get_mut("2").unwrap().x = 1.0;
        let mut n = c.s.nodes["2"].clone();
        n.id = 3;
        n.x = x;
        c.s.nodes.insert("3".into(), n);
        let s = crate::symmetry::symmetrize_2d(&c.name, &c.s, false).unwrap();
        assert_eq!(s.pair.node[&3] == 3, x == 1.0);
        let c = spatial(&c);
        let s = crate::symmetry::symmetrize_3d(&c.name, &c.s, false).unwrap();
        assert_eq!(s.pair.node[&3] == 3, x == 1.0);
    }
}

#[test]
#[ignore = "known wrong result: #1971"]
fn symmetry_rejects_unrepresentable_spans_and_accepts_finite_boundary() {
    for (left, right, accepted) in [(-f64::MAX, f64::MAX, false), (0.0, f64::MAX, true)] {
        let mut c = witness(1971);
        c.s.nodes.get_mut("1").unwrap().x = left;
        c.s.nodes.get_mut("2").unwrap().x = right;
        let s = crate::symmetry::symmetrize_2d(&c.name, &c.s, false);
        assert_eq!(s.is_some(), accepted);
        if let Some(s) = s { assert!(s.case.s.nodes.values().all(|n| n.x.is_finite())); }
        let c = spatial(&c);
        let s = crate::symmetry::symmetrize_3d(&c.name, &c.s, false);
        assert_eq!(s.is_some(), accepted);
        if let Some(s) = s { assert!(s.case.s.nodes.values().all(|n| n.x.is_finite())); }
    }
}
