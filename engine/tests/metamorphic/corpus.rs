//! The corpus: example models and fixtures (engine/tests/fixtures), the
//! feature-matrix models (engine/tests/metamorphic_corpus/feature_matrix),
//! the differential generators' models (engine/tests/metamorphic_corpus/
//! differential, exported from tools/differential) and the fuzz generators
//! (engine/tests/fuzz_models).

#[path = "../fuzz_models/mod.rs"]
mod fuzz_models;

use crate::case::{Case2, Case3};
use dedaliano_engine::types::*;
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, PartialEq)]
pub enum Tier {
    Pr,
    Nightly,
}

pub enum Model {
    D2(SolverInput),
    D3(SolverInput3D),
}

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests")
}

/// Parse a model file: 3D first (a 2D node has no `y`/`z` pair), then 2D.
pub fn parse(text: &str) -> Option<Model> {
    let v: serde_json::Value = serde_json::from_str(text).ok()?;
    if v.get("nodes").is_none() || v.get("elements").is_none() {
        return None;
    }
    if let Ok(m) = serde_json::from_value::<SolverInput3D>(v.clone()) {
        return Some(Model::D3(m));
    }
    serde_json::from_value::<SolverInput>(v).ok().map(Model::D2)
}

/// Every model file under `dir` (sorted), as (name, model).
pub fn load_dir(dir: &Path, filter: impl Fn(&str) -> bool) -> Vec<(String, Model)> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir).map(|d| d.filter_map(|e| e.ok().map(|e| e.path())).collect()).unwrap_or_default();
    files.sort();
    let mut out = Vec::new();
    for f in files {
        let name = f.file_name().unwrap().to_string_lossy().to_string();
        if !name.ends_with(".json") || !filter(&name) {
            continue;
        }
        if let Some(m) = std::fs::read_to_string(&f).ok().and_then(|t| parse(&t)) {
            out.push((name.trim_end_matches(".json").to_string(), m));
        }
    }
    out
}

fn fixtures(tier: Tier) -> Vec<(String, Model)> {
    load_dir(&root().join("fixtures"), |n| {
        n.ends_with("-input.json")
            && match tier {
                Tier::Nightly => true,
                // Examples, the small analytical fixtures and a few random models.
                Tier::Pr => !n.starts_with("random") || ["random-3-", "random-17-", "random3d-2-", "random3d-9-"].iter().any(|p| n.starts_with(p)),
            }
    })
}

fn extra_dirs(tier: Tier) -> Vec<(String, Model)> {
    let mut out = Vec::new();
    for sub in ["feature_matrix", "differential"] {
        let all = load_dir(&root().join("metamorphic_corpus").join(sub), |_| true);
        let n = all.len();
        for (k, (name, m)) in all.into_iter().enumerate() {
            if tier == Tier::Nightly || k % 7 == 0 || n < 8 {
                out.push((format!("{sub}/{name}"), m));
            }
        }
    }
    out
}

pub fn cases_2d(tier: Tier, seed: u64) -> Vec<Case2> {
    let mut out: Vec<Case2> = fixtures(tier)
        .into_iter()
        .chain(extra_dirs(tier))
        .filter_map(|(n, m)| if let Model::D2(s) = m { Some(Case2::new(n, s)) } else { None })
        .collect();
    let n_rand = if tier == Tier::Pr { 6 } else { nightly_cases(120) };
    let base = if tier == Tier::Pr { 0 } else { seed };
    for k in 0..n_rand {
        let sd = base.wrapping_add(k);
        let (mut s, dens) = fuzz_models::random_2d_model_rich(sd);
        if k % 3 == 2 {
            fuzz_models::add_random_constraints_2d(&mut s, sd);
        }
        let mut c = Case2::new(format!("fuzz_rich_2d/{sd}"), s);
        c.dens = dens;
        out.push(c);
    }
    out
}

pub fn cases_3d(tier: Tier, seed: u64) -> Vec<Case3> {
    let mut out: Vec<Case3> = fixtures(tier)
        .into_iter()
        .chain(extra_dirs(tier))
        .filter_map(|(n, m)| if let Model::D3(s) = m { Some(Case3::new(n, s)) } else { None })
        .filter(|c| tier == Tier::Nightly || c.s.nodes.len() <= 120)
        .collect();
    let n_rand = if tier == Tier::Pr { 4 } else { nightly_cases(80) };
    let base = if tier == Tier::Pr { 0 } else { seed };
    for k in 0..n_rand {
        let sd = base.wrapping_add(k);
        let (mut s, dens) = fuzz_models::random_3d_model_rich(sd);
        if k % 3 == 2 {
            fuzz_models::add_random_constraints_3d(&mut s, sd);
        }
        let mut c = Case3::new(format!("fuzz_rich_3d/{sd}"), s);
        c.dens = dens;
        out.push(c);
    }
    out
}

fn nightly_cases(default: u64) -> u64 {
    std::env::var("METAMORPHIC_CASES").map(|v| v.parse().expect("METAMORPHIC_CASES must be an integer")).unwrap_or(default)
}
