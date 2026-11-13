use crate::tally::Tally;
use serde_json::Value;

fn witness(issue: &str) -> Value {
    let all: Value =
        serde_json::from_str(include_str!("../fixtures/nightly-2026-11-13.json")).unwrap();
    all[issue].clone()
}

fn relation(issue: &str, analysis: &str, invariant: &str, seed: u64) {
    let value = witness(issue);
    let text = serde_json::to_string(&value).unwrap();
    let name = value["_nightly_name"].as_str().unwrap_or("replay");
    let tally = Tally::default();
    match crate::corpus::parse(&text).unwrap() {
        crate::corpus::Model::D2(s) => {
            let mut case = crate::case::Case2::new(name, s);
            if let Some(dens) = value.get("_nightly_dens") {
                case.dens = serde_json::from_value(dens.clone()).unwrap();
            }
            let adapter = crate::ana2::rows()
                .into_iter()
                .find(|a| a.name == analysis)
                .unwrap();
            let end = crate::INV_2D.iter().position(|r| *r == invariant).unwrap() + 1;
            crate::checks2::check_case(
                &crate::checks2::Ctx {
                    tally: &tally,
                    rng_seed: seed,
                },
                &case,
                &[adapter],
                &crate::INV_2D[..end],
            );
        }
        crate::corpus::Model::D3(s) => {
            let mut case = crate::case::Case3::new(name, s);
            if let Some(dens) = value.get("_nightly_dens") {
                case.dens = serde_json::from_value(dens.clone()).unwrap();
            }
            let adapter = crate::ana3::rows()
                .into_iter()
                .find(|a| a.name == analysis)
                .unwrap();
            let end = crate::INV_3D.iter().position(|r| *r == invariant).unwrap() + 1;
            crate::checks3::check_case(
                &crate::checks3::Ctx {
                    tally: &tally,
                    rng_seed: seed,
                },
                &case,
                &[adapter],
                &crate::INV_3D[..end],
            );
        }
    }
    let cells = tally.cells.lock().unwrap();
    let cell = &cells[&(analysis.to_owned(), invariant.to_owned())];
    assert!(cell.fails.is_empty(), "{:?}", cell.fails);
    assert!(cell.pass > 0, "{cell:?}");
}

#[test]
#[ignore = "known wrong result: #2011"]
fn issue_2011_ssi_rotation() {
    relation("2011", "SSI (no soil springs)", "rotation", 2026111302208);
}

#[test]
#[ignore = "known wrong result: #2013"]
fn issue_2013_constrained_release() {
    relation("2013", "linear (load session)", "rotation", 20770);
}

#[test]
#[ignore = "known wrong result: #2014"]
fn issue_2014_constrained_release() {
    relation("2014", "linear", "rotation", 20770);
}

#[test]
#[ignore = "known wrong result: #2015"]
fn issue_2015_constrained_release() {
    relation("2015", "staged (loads in two stages)", "mirror", 20770);
}

#[test]
#[ignore = "known wrong result: #2016"]
fn issue_2016_constrained_release() {
    relation("2016", "creep & shrinkage (t = t0)", "rotation", 20770);
}

#[test]
#[ignore = "known wrong result: #2017"]
fn issue_2017_constrained_release() {
    relation("2017", "constrained", "mirror", 20770);
}

#[test]
#[ignore = "known wrong result: #2018"]
fn issue_2018_constrained_release() {
    relation("2018", "certified linear", "mirror", 20770);
}

#[test]
#[ignore = "known wrong result: #2023"]
fn issue_2023_released_rotation_load() {
    relation(
        "2023",
        "staged (loads in two stages)",
        "rotation",
        2026111301655,
    );
}

#[test]
#[ignore = "known wrong result: #2035"]
fn issue_2035_released_rotation_load() {
    relation("2035", "certified linear", "units", 2026111301655);
}

#[test]
#[ignore = "known wrong result: #2036"]
fn issue_2036_released_rotation_load() {
    relation("2036", "linear (PCG)", "units", 2026111301655);
}

#[test]
#[ignore = "known wrong result: #2039"]
fn issue_2039_released_rotation_load() {
    relation("2039", "staged (one stage)", "units", 2026111301655);
}

#[test]
#[ignore = "known wrong result: #2058"]
fn issue_2058_released_rotation_load() {
    relation("2058", "plastic collapse", "units", 2026111301655);
}

#[test]
#[ignore = "known wrong result: #2064"]
fn issue_2064_released_rotation_load() {
    relation("2064", "linear (load session)", "units", 2026111301655);
}

#[test]
#[ignore = "known wrong result: #2066"]
fn issue_2066_released_rotation_load() {
    relation("2066", "cable solver", "units", 2026111301655);
}

#[test]
#[ignore = "known wrong result: #2067"]
fn issue_2067_released_rotation_load() {
    relation("2067", "linear (sparse path)", "units", 2026111301655);
}

#[test]
fn issue_2019_rigid_translation_matches_the_independent_zero_strain_solution() {
    let input = serde_json::from_value(witness("decoded-2019")).unwrap();
    let out = dedaliano_engine::certify::certify_linear_3d_full(&input).unwrap();
    let dedaliano_engine::certify::Certificate::Certified { abs_bound, .. } = out.certificate
    else {
        panic!("{:?}", out.certificate)
    };
    for d in &out.results.displacements {
        assert!((d.ux + 0.001).abs() <= abs_bound);
        for v in [d.uy, d.uz, d.rx, d.ry, d.rz] {
            assert!(v.abs() <= abs_bound);
        }
    }
    for reaction in &out.results.reactions {
        let bound = out
            .shown
            .reaction_bounds
            .iter()
            .find(|b| b.node_id == reaction.node_id)
            .unwrap();
        for (v, b) in [
            (reaction.fx, bound.fx),
            (reaction.fy, bound.fy),
            (reaction.fz, bound.fz),
            (reaction.mx, bound.mx),
            (reaction.my, bound.my),
            (reaction.mz, bound.mz),
        ] {
            assert!(v.abs() <= b, "{reaction:?} outside {bound:?}");
        }
    }
}
