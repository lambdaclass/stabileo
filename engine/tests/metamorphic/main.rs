//! Metamorphic tests: physics invariants on every analysis and the corpus
//! (docs/verification/METAMORPHIC.md).
//!
//! No reference solution is needed: each model is solved, transformed (rigid
//! rotation, mirror, renumbering, unit change, load splitting, unit loads),
//! solved again, and the two answers must be related exactly as physics says,
//! within a tolerance derived from the model's conditioning
//! (`dedaliano_engine::metamorphic::conditioning`).
//!
//! Tiers:
//! * `metamorphic_pr_*` — every pull request: a fixed sample of the corpus;
//! * `metamorphic_nightly_*` (`--ignored`) — the whole corpus and many random
//!   models; `METAMORPHIC_SEED` moves the random part (printed on failure).

mod active;
mod generated;
mod safety_cases;
mod ana2;
mod ana3;
mod case;
mod checks2;
mod checks3;
mod corpus;
mod modal_checks;
mod regressions;
mod response;
mod symmetry;
mod tally;

use tally::Tally;

pub const INV_2D: &[&str] = &["rotation", "mirror", "relabel", "reversal", "units", "superposition", "reciprocity", "energy", "symmetry", "linear agreement", "modal orthogonality"];
pub const INV_3D: &[&str] = &["rotation", "relabel", "reversal", "units", "superposition", "reciprocity", "energy", "symmetry", "linear agreement", "modal orthogonality"];

fn seed() -> u64 {
    std::env::var("METAMORPHIC_SEED").ok().and_then(|s| s.parse().ok()).unwrap_or(20261018)
}

/// The invariants × analyses matrix of a PR-tier run, as it appears in
/// docs/verification/METAMORPHIC.md (between the BEGIN/END markers).
fn render(t: &Tally, anas: &[&str], invs: &[&str]) -> String {
    let mut s = format!("| Analysis | {} |\n|---|{}\n", invs.join(" | "), ":-:|".repeat(invs.len()));
    for a in anas {
        let cells: Vec<&str> = invs.iter().map(|i| t.symbol(a, i)).collect();
        s += &format!("| {a} | {} |\n", cells.join(" | "));
    }
    s
}

fn check_doc(section: &str, table: &str) {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../docs/verification/METAMORPHIC.md");
    let doc = std::fs::read_to_string(&path).unwrap_or_default();
    let (b, e) = (format!("<!-- BEGIN {section} -->\n"), format!("<!-- END {section} -->"));
    let (Some(i), Some(j)) = (doc.find(&b), doc.find(&e)) else { panic!("docs/verification/METAMORPHIC.md has no {section} section") };
    let current = &doc[i + b.len()..j];
    if current != table {
        if std::env::var("UPDATE_METAMORPHIC_DOC").is_ok() {
            let new = format!("{}{}{}", &doc[..i + b.len()], table, &doc[j..]);
            std::fs::write(&path, new).unwrap();
        } else {
            panic!("docs/verification/METAMORPHIC.md ({section}) is out of date: rerun with UPDATE_METAMORPHIC_DOC=1\n{table}");
        }
    }
}

fn finish(name: &str, t: &Tally) {
    let rep = t.report();
    println!("== {name} (seed {})\n{rep}", seed());
    if let Ok(dir) = std::env::var("METAMORPHIC_REPORT_DIR") {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(format!("{dir}/{name}.txt"), &rep);
    }
    let f = t.failures();
    assert!(f.is_empty(), "{} metamorphic violation(s) (seed {}):\n{}", f.len(), seed(), f.join("\n"));
}

fn run_2d(name: &str, cases: Vec<case::Case2>, only: Option<&str>) {
    let t = Tally::default();
    let ctx = checks2::Ctx { tally: &t, rng_seed: seed() };
    let anas: Vec<ana2::Ana2> = ana2::rows().into_iter().filter(|a| only.map_or(true, |o| a.name.contains(o))).collect();
    for (index, c) in cases.iter().enumerate() {
        let before = t.failures().len();
        checks2::check_case(&ctx, c, &anas, INV_2D);
        if t.failures().len() > before {
            save_failing_model(name, index, &c.s, &c.name, &c.dens);
        }
    }
    for (index, c) in cases.iter().enumerate() {
        let before = t.failures().len();
        for anti in [false, true] {
            if let Some(sym) = symmetry::symmetrize_2d(&c.name, &c.s, anti) {
                symmetry::check_2d(&t, &sym, anti, &anas);
            }
        }
        if t.failures().len() > before {
            save_failing_model(name, index, &c.s, &c.name, &c.dens);
        }
    }
    finish(name, &t);
    if name == "pr_2d" && only.is_none() {
        check_doc(name, &render(&t, &anas.iter().map(|a| a.name).collect::<Vec<_>>(), INV_2D));
    }
}

fn run_3d(name: &str, cases: Vec<case::Case3>, only: Option<&str>) {
    let t = Tally::default();
    let ctx = checks3::Ctx { tally: &t, rng_seed: seed() };
    let anas: Vec<ana3::Ana3> = ana3::rows().into_iter().filter(|a| only.map_or(true, |o| a.name.contains(o))).collect();
    for (index, c) in cases.iter().enumerate() {
        let before = t.failures().len();
        checks3::check_case(&ctx, c, &anas, INV_3D);
        if t.failures().len() > before {
            save_failing_model(name, index, &c.s, &c.name, &c.dens);
        }
    }
    for (index, c) in cases.iter().enumerate() {
        let before = t.failures().len();
        for anti in [false, true] {
            if let Some(sym) = symmetry::symmetrize_3d(&c.name, &c.s, anti) {
                symmetry::check_3d(&t, &sym, anti, &anas);
            }
        }
        if t.failures().len() > before {
            save_failing_model(name, index, &c.s, &c.name, &c.dens);
        }
    }
    finish(name, &t);
    if name == "pr_3d" && only.is_none() {
        check_doc(name, &render(&t, &anas.iter().map(|a| a.name).collect::<Vec<_>>(), INV_3D));
    }
}

fn only() -> Option<String> {
    std::env::var("METAMORPHIC_ONLY").ok()
}

#[test]
fn metamorphic_pr_2d() {
    run_2d("pr_2d", corpus::cases_2d(corpus::Tier::Pr, seed()), only().as_deref());
}

#[test]
fn metamorphic_pr_3d() {
    run_3d("pr_3d", corpus::cases_3d(corpus::Tier::Pr, seed()), only().as_deref());
}

#[test]
#[ignore]
fn metamorphic_nightly_2d() {
    run_2d("nightly_2d", corpus::cases_2d(corpus::Tier::Nightly, seed()), only().as_deref());
}

#[test]
#[ignore]
fn metamorphic_nightly_3d() {
    run_3d("nightly_3d", corpus::cases_3d(corpus::Tier::Nightly, seed()), only().as_deref());
}

/// Replay one JSON model, emitting structured results for the nightly reducer.
#[test]
#[ignore]
fn metamorphic_replay() {
    let Ok(path) = std::env::var("NIGHTLY_MODEL") else { return };
    let text = std::fs::read_to_string(path).unwrap();
    let metadata: serde_json::Value = serde_json::from_str(&text).unwrap();
    let name = metadata["_nightly_name"].as_str().unwrap_or("replay").to_owned();
    let model = corpus::parse(&text).expect("valid model JSON");
    let t = Tally::default();
    match model {
        corpus::Model::D2(s) => {
            let mut c = case::Case2::new(name, s);
            if let Some(dens) = metadata.get("_nightly_dens") {
                c.dens = serde_json::from_value(dens.clone()).unwrap();
            }
            let anas = ana2::rows();
            checks2::check_case(&checks2::Ctx { tally: &t, rng_seed: seed() }, &c, &anas, INV_2D);
            for anti in [false, true] {
                if let Some(sym) = symmetry::symmetrize_2d(&c.name, &c.s, anti) {
                    symmetry::check_2d(&t, &sym, anti, &anas);
                }
            }
        }
        corpus::Model::D3(s) => {
            let mut c = case::Case3::new(name, s);
            if let Some(dens) = metadata.get("_nightly_dens") {
                c.dens = serde_json::from_value(dens.clone()).unwrap();
            }
            let anas = ana3::rows();
            checks3::check_case(&checks3::Ctx { tally: &t, rng_seed: seed() }, &c, &anas, INV_3D);
            for anti in [false, true] {
                if let Some(sym) = symmetry::symmetrize_3d(&c.name, &c.s, anti) {
                    symmetry::check_3d(&t, &sym, anti, &anas);
                }
            }
        }
    }
    let results = t.replay_results();
    std::fs::write(std::env::var("NIGHTLY_RESULTS").unwrap(), serde_json::to_vec(&results).unwrap()).unwrap();
    assert!(t.failures().is_empty(), "metamorphic violations: {results}");
}

fn save_failing_model<T: serde::Serialize>(name: &str, index: usize, model: &T, case_name: &str, dens: &std::collections::HashMap<String, f64>) {
    if let Ok(dir) = std::env::var("METAMORPHIC_REPORT_DIR") {
        let dir = std::path::Path::new(&dir).join("models");
        std::fs::create_dir_all(&dir).unwrap();
        let mut value = serde_json::to_value(model).unwrap();
        value["_nightly_name"] = serde_json::json!(case_name);
        value["_nightly_dens"] = serde_json::json!(dens);
        std::fs::write(dir.join(format!("{name}-{index}.json")), serde_json::to_vec(&value).unwrap()).unwrap();
    }
}
