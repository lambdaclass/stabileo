//! End-to-end certificates (docs/verification/CERTIFY.md, "End-to-end
//! certificates"): the independent re-assembly of K and f from the model
//! (`certify::reassembly`) agrees with the engine on every example model,
//! fixture and random model it covers, and catches planted assembly bugs.

use crate::e2e_models;
use crate::fuzz_models;

use dedaliano_engine::certify::reassembly::EndToEnd;
use dedaliano_engine::certify::{certify_linear_2d_full, certify_linear_3d_full, CertificateLevel};
use dedaliano_engine::types::*;
use fuzz_models::{
    add_random_constraints_2d, add_random_constraints_3d, random_2d_model, random_2d_model_rich, random_3d_model,
    random_3d_model_rich,
};

fn fixture_paths(prefix: &str, filter: impl Fn(&str) -> bool) -> Vec<std::path::PathBuf> {
    let mut v: Vec<_> = std::fs::read_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures"))
        .unwrap()
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            let n = p.file_name().unwrap().to_str().unwrap();
            n.starts_with(prefix) && n.ends_with("-input.json") && filter(n)
        })
        .collect();
    v.sort();
    v
}

#[derive(Default, Debug)]
struct Tally {
    certified: usize,
    out_of_scope: usize,
    not_checked: usize,
    /// No bound against the model (it is singular, or the test is too weak).
    uncertified: Vec<String>,
    /// The model provably has no solution, yet the engine returned one.
    no_solution: Vec<String>,
    failed: Vec<String>,
    worst_rel: f64,
}

impl Tally {
    fn add(&mut self, name: &str, e2e: &EndToEnd, assembled_ok: bool) {
        match e2e {
            EndToEnd::Certified { rel_bound, k_discrepancy, f_discrepancy, .. } => {
                self.certified += 1;
                self.worst_rel = self.worst_rel.max(*rel_bound);
                eprintln!("{name}: e2e rel={rel_bound:.2e} dK={k_discrepancy:.1e} df={f_discrepancy:.1e}");
            }
            EndToEnd::OutOfScope { reason } => {
                self.out_of_scope += 1;
                eprintln!("{name}: out of scope: {reason}");
            }
            EndToEnd::NotChecked => self.not_checked += 1,
            EndToEnd::Uncertified { reason } => {
                eprintln!("{name}: uncertified (assembled certified: {assembled_ok}): {reason}");
                if assembled_ok {
                    self.uncertified.push(format!("{name}: {reason}"));
                }
            }
            EndToEnd::Failed { reason } if reason.starts_with("a load acts on") => {
                eprintln!("{name}: no solution (assembled certified: {assembled_ok}): {reason}");
                if assembled_ok {
                    self.no_solution.push(format!("{name}: {reason}"));
                }
            }
            EndToEnd::Failed { reason } => {
                eprintln!("{name}: FAILED (assembled certified: {assembled_ok}): {reason}");
                if assembled_ok {
                    self.failed.push(format!("{name}: {reason}"));
                }
            }
        }
    }
}

#[test]
fn end_to_end_2d_fixtures() {
    let mut paths = fixture_paths("ex-", |n| !n.starts_with("ex-3d-"));
    paths.extend(fixture_paths("random-", |n| !n.starts_with("random3d")));
    paths.extend(fixture_paths("", |n| ["cantilever-input", "portal-", "ss-beam"].iter().any(|p| n.starts_with(p))));
    let mut t = Tally::default();
    for p in &paths {
        let name = p.file_name().unwrap().to_str().unwrap();
        let Ok(input) = serde_json::from_str::<SolverInput>(&std::fs::read_to_string(p).unwrap()) else { continue };
        let Ok(out) = certify_linear_2d_full(&input) else { continue };
        t.add(name, &out.end_to_end, out.certificate.is_certified());
        if out.end_to_end.is_certified() {
            assert_eq!(out.certificate_level, CertificateLevel::EndToEnd);
        }
    }
    eprintln!("2D fixtures: {t:?}");
    assert!(t.failed.is_empty() && t.uncertified.is_empty() && t.no_solution.is_empty(), "{t:#?}");
    assert!(t.certified >= 40, "only {} 2D fixtures certified end to end", t.certified);
}

#[test]
fn end_to_end_3d_fixtures() {
    let mut paths = fixture_paths("ex-3d-", |_| true);
    paths.extend(fixture_paths("random3d-", |_| true));
    paths.extend(fixture_paths("cantilever-3d", |_| true));
    let mut t = Tally::default();
    for p in &paths {
        let name = p.file_name().unwrap().to_str().unwrap();
        let Ok(input) = serde_json::from_str::<SolverInput3D>(&std::fs::read_to_string(p).unwrap()) else { continue };
        let t0 = std::time::Instant::now();
        let Ok(out) = certify_linear_3d_full(&input) else { continue };
        let full = t0.elapsed();
        let t1 = std::time::Instant::now();
        let _ = dedaliano_engine::certify::reassembly::end_to_end_3d(&input, &input.loads, &out.results);
        eprintln!("{name}: certify_linear_3d_full {:.1} ms, of which end to end {:.1} ms", full.as_secs_f64() * 1e3, t1.elapsed().as_secs_f64() * 1e3);
        t.add(name, &out.end_to_end, out.certificate.is_certified());
    }
    eprintln!("3D fixtures: {t:?}");
    assert!(t.failed.is_empty() && t.uncertified.is_empty() && t.no_solution.is_empty(), "{t:#?}");
    assert!(t.certified >= 20, "only {} 3D fixtures certified end to end", t.certified);
}

fn sweep_2d(seeds: std::ops::Range<u64>) -> Tally {
    let mut t = Tally::default();
    for seed in seeds {
        for (kind, input) in [("rich", model_2d(seed)), ("plain", random_2d_model(seed))] {
            match certify_linear_2d_full(&input) {
                Ok(out) => t.add(&format!("2d {kind} seed {seed}"), &out.end_to_end, out.certificate.is_certified()),
                Err(e) => eprintln!("2d {kind} seed {seed}: solver error {e}"),
            }
        }
    }
    t
}

/// The frame/truss part of a rich random 3D model (shells, connectors, curved
/// beams and warping are outside the re-assembly's scope).
fn frame_part_3d(seed: u64) -> SolverInput3D {
    let (mut input, _) = random_3d_model_rich(seed);
    input.plates.clear();
    input.quads.clear();
    input.quad9s.clear();
    input.solid_shells.clear();
    input.curved_shells.clear();
    input.curved_beams.clear();
    input.connectors.clear();
    for s in input.sections.values_mut() {
        s.cw = None;
    }
    input.loads.retain(|l| {
        matches!(l, SolverLoad3D::Nodal(_) | SolverLoad3D::Distributed(_) | SolverLoad3D::PointOnElement(_) | SolverLoad3D::Thermal(_))
    });
    for l in input.loads.iter_mut() {
        if let SolverLoad3D::Nodal(n) = l {
            n.bw = None;
        }
    }
    if seed % 3 == 0 {
        add_random_constraints_3d(&mut input, seed);
    }
    input
}

fn sweep_3d(seeds: std::ops::Range<u64>) -> Tally {
    let mut t = Tally::default();
    for seed in seeds {
        for (kind, input) in [("rich", frame_part_3d(seed)), ("plain", random_3d_model(seed))] {
            if input.elements.is_empty() {
                continue;
            }
            match certify_linear_3d_full(&input) {
                Ok(out) => t.add(&format!("3d {kind} seed {seed}"), &out.end_to_end, out.certificate.is_certified()),
                Err(e) => eprintln!("3d {kind} seed {seed}: solver error {e}"),
            }
        }
    }
    t
}

fn model_2d(seed: u64) -> SolverInput {
    let (mut input, _) = random_2d_model_rich(seed);
    input.connectors.clear();
    if seed % 3 == 0 {
        add_random_constraints_2d(&mut input, seed);
    }
    input
}

/// One seed, printed: `E2E_SEED=99 E2E_DIM=2 cargo test --release --test
/// certify_end_to_end e2e_one -- --ignored --nocapture`.
#[test]
#[ignore]
fn e2e_one() {
    let seed: u64 = std::env::var("E2E_SEED").unwrap().parse().unwrap();
    let dim = std::env::var("E2E_DIM").unwrap_or("2".into());
    if dim == "2" {
        let input = model_2d(seed);
        println!("{}", serde_json::to_string_pretty(&input).unwrap());
        let out = certify_linear_2d_full(&input).unwrap();
        println!("{:?}\n{:?}", out.certificate, out.end_to_end);
    } else {
        let input = if dim == "3p" { random_3d_model(seed) } else { frame_part_3d(seed) };
        println!("{}", serde_json::to_string_pretty(&input).unwrap());
        let out = certify_linear_3d_full(&input).unwrap();
        println!("{:?}\n{:?}", out.certificate, out.end_to_end);
    }
}

#[test]
fn end_to_end_random_2d() {
    let t = sweep_2d(0..150);
    eprintln!("random 2D: {t:?}");
    assert!(t.failed.is_empty(), "{:#?}", t.failed);
    // The rich generator puts settlements on DOFs their support leaves free, which
    // the check refuses (outOfScope) rather than drop.
    assert!(t.certified >= 50, "only {} random 2D models certified end to end", t.certified);
}

#[test]
fn end_to_end_random_3d() {
    let t = sweep_3d(0..120);
    eprintln!("random 3D: {t:?}");
    assert!(t.failed.is_empty(), "{:#?}", t.failed);
    assert!(t.certified >= 18, "only {} random 3D models certified end to end", t.certified);
}

/// Stable random frames covering every feature in scope: every model the
/// assembled-level certificate certifies is certified end to end.
#[test]
fn end_to_end_stable_2d() {
    let mut t = Tally::default();
    let mut assembled = 0;
    for seed in 0..200 {
        let input = e2e_models::stable_2d(seed);
        match certify_linear_2d_full(&input) {
            Ok(out) => {
                assembled += out.certificate.is_certified() as usize;
                t.add(&format!("stable 2d seed {seed}"), &out.end_to_end, out.certificate.is_certified());
            }
            Err(e) => eprintln!("stable 2d seed {seed}: solver error {e}"),
        }
    }
    eprintln!("stable 2D: {t:?}, assembled-level certified {assembled}");
    assert!(t.failed.is_empty() && t.uncertified.is_empty() && t.no_solution.is_empty(), "{t:#?}");
    assert_eq!(t.certified, assembled);
    assert!(t.certified >= 180, "only {} stable 2D models certified end to end", t.certified);
}

#[test]
fn end_to_end_stable_3d() {
    let mut t = Tally::default();
    let mut assembled = 0;
    for seed in 0..150 {
        let input = e2e_models::stable_3d(seed);
        match certify_linear_3d_full(&input) {
            Ok(out) => {
                assembled += out.certificate.is_certified() as usize;
                t.add(&format!("stable 3d seed {seed}"), &out.end_to_end, out.certificate.is_certified());
            }
            Err(e) => eprintln!("stable 3d seed {seed}: solver error {e}"),
        }
    }
    eprintln!("stable 3D: {t:?}, assembled-level certified {assembled}");
    assert!(t.failed.is_empty() && t.uncertified.is_empty() && t.no_solution.is_empty(), "{t:#?}");
    assert_eq!(t.certified, assembled);
    assert!(t.certified >= 135, "only {} stable 3D models certified end to end", t.certified);
}

/// `E2E_SEED=161 cargo test --release --test certificates certify_end_to_end::stable_one -- --ignored --nocapture`
#[test]
#[ignore]
fn stable_one() {
    let seed: u64 = std::env::var("E2E_SEED").unwrap().parse().unwrap();
    let dim = std::env::var("E2E_DIM").unwrap_or("2".into());
    if dim == "2" {
        let input = e2e_models::stable_2d(seed);
        println!("{}", serde_json::to_string_pretty(&input).unwrap());
        let out = certify_linear_2d_full(&input).unwrap();
        println!("{:?}\n{:?}", out.certificate, out.end_to_end);
    } else {
        let input = e2e_models::stable_3d(seed);
        println!("{}", serde_json::to_string_pretty(&input).unwrap());
        let out = certify_linear_3d_full(&input).unwrap();
        println!("{:?}\n{:?}", out.certificate, out.end_to_end);
    }
}

/// Every model file in `E2E_DIR` (e.g. dumped from the differential
/// generators, `tools/differential`): `E2E_DIR=… cargo test --release --test
/// certify_end_to_end e2e_dir -- --ignored --nocapture`.
#[test]
#[ignore]
fn e2e_dir() {
    let dir = std::env::var("E2E_DIR").unwrap();
    let mut paths: Vec<_> = std::fs::read_dir(&dir).unwrap().filter_map(|e| e.ok().map(|e| e.path())).collect();
    paths.sort();
    let mut by_gen: std::collections::BTreeMap<String, Tally> = Default::default();
    let mut solver_errors: std::collections::BTreeMap<String, usize> = Default::default();
    for p in &paths {
        let name = p.file_name().unwrap().to_str().unwrap().to_string();
        let gen = name.rsplit_once('-').map(|x| x.0.to_string()).unwrap_or_default();
        let json = std::fs::read_to_string(p).unwrap();
        let t = by_gen.entry(gen.clone()).or_default();
        if let Ok(input) = serde_json::from_str::<SolverInput>(&json) {
            match certify_linear_2d_full(&input) {
                Ok(out) => t.add(&name, &out.end_to_end, out.certificate.is_certified()),
                Err(_) => *solver_errors.entry(gen).or_default() += 1,
            }
        } else if let Ok(input) = serde_json::from_str::<SolverInput3D>(&json) {
            match certify_linear_3d_full(&input) {
                Ok(out) => t.add(&name, &out.end_to_end, out.certificate.is_certified()),
                Err(_) => *solver_errors.entry(gen).or_default() += 1,
            }
        } else {
            eprintln!("{name}: not a solver input");
        }
    }
    let mut failed = 0;
    for (g, t) in &by_gen {
        println!(
            "{g}: certified {}, outOfScope {}, uncertified(assembled ok) {}, noSolution {}, FAILED {}, solver errors {}",
            t.certified, t.out_of_scope, t.uncertified.len(), t.no_solution.len(), t.failed.len(),
            solver_errors.get(g).copied().unwrap_or(0)
        );
        for f in t.failed.iter().chain(&t.uncertified).chain(&t.no_solution) {
            println!("    {f}");
        }
        failed += t.failed.len();
    }
    assert_eq!(failed, 0);
}
