use crate::case::Case2;
use crate::response::Resp;
use crate::tally::Tally;

fn cantilever() -> Case2 {
    Case2::new(
        "seeded cantilever",
        serde_json::from_str(include_str!("../fixtures/ex-cantilever-input.json")).unwrap(),
    )
}

fn check_2d(a: crate::ana2::Ana2, invariant: &str) -> serde_json::Value {
    let t = Tally::default();
    let mut c = cantilever();
    c.s.loads.extend(c.s.loads.clone());
    crate::checks2::check_case(
        &crate::checks2::Ctx {
            tally: &t,
            rng_seed: 1919,
        },
        &c,
        &[a],
        &[invariant],
    );
    t.replay_results()
}

#[test]
fn seeded_failure_empty_linear_agreement() {
    let mut a = crate::ana2::rows()
        .into_iter()
        .find(|a| a.name == "linear (dense reference)")
        .unwrap();
    assert_eq!(check_2d(a, "linear agreement")["verdicts"][0]["pass"], 1);
    a = crate::ana2::rows()
        .into_iter()
        .find(|a| a.name == "linear (dense reference)")
        .unwrap();
    a.run = |_| Ok(Resp::default());
    let result = check_2d(a, "linear agreement");
    assert_eq!(result["verdicts"][0]["fail"], 1, "{result}");
}

#[test]
fn seeded_failure_energy_dropped_load() {
    let mut a = crate::ana2::rows()
        .into_iter()
        .find(|a| a.name == "linear")
        .unwrap();
    assert_eq!(check_2d(a, "energy")["verdicts"][0]["pass"], 1);
    a = crate::ana2::rows()
        .into_iter()
        .find(|a| a.name == "linear")
        .unwrap();
    a.run = |c| {
        let mut unloaded = c.s.clone();
        unloaded.loads.clear();
        Ok(crate::response::static_2d(
            &dedaliano_engine::solver::linear::solve_2d(&unloaded)?,
        ))
    };
    let result = check_2d(a, "energy");
    assert_eq!(result["verdicts"][0]["fail"], 1, "{result}");
}

fn cantilever_3d() -> crate::case::Case3 {
    let s =
        serde_json::from_str(include_str!("../fixtures/ex-3d-cantilever-load-input.json")).unwrap();
    crate::case::Case3::new("seeded cantilever 3D", s)
}

fn check_3d(a: crate::ana3::Ana3, invariant: &str) -> serde_json::Value {
    let t = Tally::default();
    let mut c = cantilever_3d();
    c.s.loads.extend(c.s.loads.clone());
    crate::checks3::check_case(
        &crate::checks3::Ctx {
            tally: &t,
            rng_seed: 1919,
        },
        &c,
        &[a],
        &[invariant],
    );
    t.replay_results()
}

#[test]
fn seeded_failure_energy_dropped_load_3d() {
    let mut a = crate::ana3::rows()
        .into_iter()
        .find(|a| a.name == "linear")
        .unwrap();
    assert_eq!(check_3d(a, "energy")["verdicts"][0]["pass"], 1);
    a = crate::ana3::rows()
        .into_iter()
        .find(|a| a.name == "linear")
        .unwrap();
    a.run = |c| {
        let mut unloaded = c.s.clone();
        unloaded.loads.clear();
        Ok(crate::response::static_3d(
            &dedaliano_engine::solver::linear::solve_3d(&unloaded)?,
        ))
    };
    let result = check_3d(a, "energy");
    assert_eq!(result["verdicts"][0]["fail"], 1, "{result}");
}

#[derive(Clone, Copy, Debug)]
enum Fault {
    Sign,
    Axes,
    Unit,
    Stiffness,
}

thread_local! {
    static SEED: std::cell::Cell<Option<(usize, usize, Fault)>> = const { std::cell::Cell::new(None) };
}

fn seeded<T>(at: usize, fault: Fault, run: impl FnOnce() -> T) -> T {
    struct Reset;
    impl Drop for Reset {
        fn drop(&mut self) {
            SEED.with(|s| s.set(None));
        }
    }
    SEED.with(|s| {
        assert!(s.get().is_none());
        s.set(Some((at, 0, fault)));
    });
    let _reset = Reset;
    let result = run();
    SEED.with(|s| assert!(s.get().unwrap().1 > at, "seed was never injected"));
    result
}

fn perturb(mut r: Resp) -> Resp {
    let fault = SEED.with(|s| {
        let (at, seen, fault) = s.get()?;
        s.set(Some((at, seen + 1, fault)));
        (at == seen).then_some(fault)
    });
    let Some(fault) = fault else { return r };
    let item = r
        .0
        .iter_mut()
        .filter(|i| (i.tag == "u" || i.tag.starts_with("lambda")) && i.v.iter().any(|v| *v != 0.0))
        .min_by_key(|i| i.node)
        .expect("seed requires displacements");
    assert!(
        item.v.iter().any(|v| *v != 0.0),
        "seed requires a nonzero response"
    );
    match fault {
        Fault::Sign => item.v.iter_mut().for_each(|v| *v = -*v),
        Fault::Axes => item.v.swap(0, 1),
        Fault::Unit => item.v.iter_mut().for_each(|v| *v *= 1000.0),
        Fault::Stiffness => item.v.iter_mut().for_each(|v| *v /= 1.01),
    }
    r
}

fn static_2d(c: &Case2) -> Result<Resp, String> {
    Ok(perturb(crate::response::static_2d(
        &dedaliano_engine::solver::linear::solve_2d(&c.s)?,
    )))
}

fn static_3d(c: &crate::case::Case3) -> Result<Resp, String> {
    Ok(perturb(crate::response::static_3d(
        &dedaliano_engine::solver::linear::solve_3d(&c.s)?,
    )))
}

fn assert_red(result: &serde_json::Value, invariant: &str) {
    assert_eq!(result["verdicts"].as_array().unwrap().len(), 1, "{result}");
    assert_eq!(result["verdicts"][0]["invariant"], invariant, "{result}");
    assert_eq!(result["verdicts"][0]["fail"], 1, "{result}");
    assert_eq!(result["verdicts"][0]["pass"], 0, "{result}");
    assert_eq!(result["failures"].as_array().unwrap().len(), 1, "{result}");
}

const RELATIONS: &[(&str, usize, Fault)] = &[
    ("rotation", 1, Fault::Axes),
    ("mirror", 1, Fault::Sign),
    ("relabel", 1, Fault::Stiffness),
    ("reversal", 1, Fault::Sign),
    ("units", 1, Fault::Unit),
    ("superposition", 3, Fault::Stiffness),
    ("superposition", 4, Fault::Unit),
    ("load order", 1, Fault::Sign),
    ("reciprocity", 1, Fault::Sign),
    ("reciprocity", 6, Fault::Sign),
    ("linear agreement", 0, Fault::Stiffness),
    ("planes", 0, Fault::Axes),
];

#[test]
fn seeded_failure_relations_2d() {
    for &(invariant, at, fault) in RELATIONS {
        let analysis = || {
            let name = if invariant == "linear agreement" {
                "linear (dense reference)"
            } else {
                "linear"
            };
            let mut a = crate::ana2::rows()
                .into_iter()
                .find(|a| a.name == name)
                .unwrap();
            a.run = static_2d;
            a
        };
        let control = check_2d(analysis(), invariant);
        assert_eq!(control["verdicts"][0]["pass"], 1, "{invariant}: {control}");
        let result = seeded(at, fault, || check_2d(analysis(), invariant));
        assert_red(&result, invariant);
    }
}

#[test]
fn seeded_failure_relations_3d() {
    for &(invariant, at, fault) in RELATIONS.iter().filter(|r| r.0 != "planes") {
        let analysis = || {
            let name = if invariant == "linear agreement" {
                "linear (sparse path)"
            } else {
                "linear"
            };
            let mut a = crate::ana3::rows()
                .into_iter()
                .find(|a| a.name == name)
                .unwrap();
            a.run = static_3d;
            a
        };
        let control = check_3d(analysis(), invariant);
        assert_eq!(control["verdicts"][0]["pass"], 1, "{invariant}: {control}");
        let result = seeded(at, fault, || check_3d(analysis(), invariant));
        assert_red(&result, invariant);
    }
}

#[test]
fn seeded_failure_symmetry() {
    for anti in [false, true] {
        let mut c = cantilever();
        let mut tip = c.s.nodes["2"].clone();
        tip.id = 3;
        c.s.nodes.get_mut("2").unwrap().x *= 0.5;
        c.s.nodes.insert("3".into(), tip);
        let mut e = c.s.elements["1"].clone();
        (e.id, e.node_i, e.node_j) = (2, 2, 3);
        c.s.elements.insert("2".into(), e);
        for load in &mut c.s.loads {
            if let dedaliano_engine::types::SolverLoad::Nodal(n) = load {
                n.node_id = 3;
            }
        }
        let sym = crate::symmetry::symmetrize_2d(&c.name, &c.s, anti).unwrap();
        let check = || {
            let mut a = crate::ana2::rows()
                .into_iter()
                .find(|a| a.name == "linear")
                .unwrap();
            a.run = static_2d;
            let t = Tally::default();
            crate::symmetry::check_2d(&t, &sym, anti, &[a]);
            t.replay_results()
        };
        assert_eq!(check()["verdicts"][0]["pass"], 1);
        assert_red(&seeded(0, Fault::Sign, check), "symmetry");
        let mut c = cantilever_3d();
        let mut tip = c.s.nodes["2"].clone();
        tip.id = 3;
        c.s.nodes.get_mut("2").unwrap().x *= 0.5;
        c.s.nodes.insert("3".into(), tip);
        let mut e = c.s.elements["1"].clone();
        (e.id, e.node_i, e.node_j) = (2, 2, 3);
        c.s.elements.insert("2".into(), e);
        for load in &mut c.s.loads {
            if let dedaliano_engine::types::SolverLoad3D::Nodal(n) = load {
                n.node_id = 3;
            }
        }
        let sym = crate::symmetry::symmetrize_3d(&c.name, &c.s, anti).unwrap();
        let check = || {
            let mut a = crate::ana3::rows()
                .into_iter()
                .find(|a| a.name == "linear")
                .unwrap();
            a.run = static_3d;
            let t = Tally::default();
            crate::symmetry::check_3d(&t, &sym, anti, &[a]);
            t.replay_results()
        };
        assert_eq!(check()["verdicts"][0]["pass"], 1);
        assert_red(&seeded(0, Fault::Sign, check), "symmetry");
    }
}

pub fn replay() -> bool {
    let Ok(fault) = std::env::var("STABILEO_SELFTEST_REPLAY") else {
        return false;
    };
    let text = std::fs::read_to_string(std::env::var("NIGHTLY_MODEL").unwrap()).unwrap();
    let c = Case2::new("seeded replay", serde_json::from_str(&text).unwrap());
    let run = || {
        let mut a = crate::ana2::rows()
            .into_iter()
            .find(|a| a.name == "linear")
            .unwrap();
        a.run = static_2d;
        let t = Tally::default();
        crate::checks2::check_case(
            &crate::checks2::Ctx {
                tally: &t,
                rng_seed: crate::seed(),
            },
            &c,
            &[a],
            &["rotation"],
        );
        t
    };
    let tally = match fault.as_str() {
        "control" => run(),
        "sign" => seeded(1, Fault::Sign, run),
        _ => panic!("unknown self-test fault"),
    };
    crate::finish_replay(&tally);
    true
}

#[test]
fn seeded_failure_reaches_nightly_findings() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap();
    let scratch = tempfile::tempdir().unwrap();
    let out = scratch.path().join("nightly");
    assert!(!out.exists());
    for (fault, code) in [("control", 0), ("sign", 1)] {
        let destination = out.join(fault);
        let output = std::process::Command::new("python3")
            .arg("-B")
            .arg("-I")
            .arg(root.join("scripts/nightly-models.py"))
            .arg("--model")
            .arg(root.join("engine/tests/fixtures/ex-cantilever-input.json"))
            .args([
                "--check",
                "metamorphic",
                "--seed",
                "1919",
                "--count",
                "1",
                "--reduce-seconds",
                "0",
                "--out",
            ])
            .arg(&destination)
            .env("NIGHTLY_REPLAY_BIN", std::env::current_exe().unwrap())
            .env("STABILEO_SELFTEST_REPLAY", fault)
            .env_remove("ASTER_PYTHON")
            .output()
            .unwrap();
        assert_eq!(
            output.status.code(),
            Some(code),
            "{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        let summary: serde_json::Value =
            serde_json::from_slice(&std::fs::read(destination.join("summary.json")).unwrap())
                .unwrap();
        assert_eq!(summary["findings"], code);
        assert_eq!(summary["comparisons"]["metamorphic"]["completed"], 1);
        if code == 1 {
            let findings: Vec<_> = std::fs::read_dir(&destination)
                .unwrap()
                .map(Result::unwrap)
                .filter(|p| p.file_name().to_string_lossy().ends_with(".finding.json"))
                .collect();
            assert_eq!(findings.len(), 1);
            let finding: serde_json::Value =
                serde_json::from_slice(&std::fs::read(findings[0].path()).unwrap()).unwrap();
            assert_eq!(finding["test"], "metamorphic/linear/rotation");
            assert_eq!(finding["seed"], 1919);
            assert!(!finding["details"].as_array().unwrap().is_empty());
        }
    }
}

#[test]
fn seeded_failure_inverse_load_scaling() {
    let c = Case2::new(
        "compressed column seed",
        crate::common::make_column(4, 5.0, 200_000.0, 0.01, 1e-4, "pinned", "rollerX", -100.0),
    );
    let check = || {
        let mut a = crate::ana2::rows()
            .into_iter()
            .find(|a| a.name == "buckling")
            .unwrap();
        a.run = |c| {
            let original = crate::ana2::rows()
                .into_iter()
                .find(|a| a.name == "buckling")
                .unwrap();
            Ok(perturb((original.run)(c)?))
        };
        let t = Tally::default();
        crate::checks2::check_case(
            &crate::checks2::Ctx {
                tally: &t,
                rng_seed: 1919,
            },
            &c,
            &[a],
            &["superposition"],
        );
        t.replay_results()
    };
    let control = check();
    assert_eq!(control["verdicts"][0]["pass"], 1, "{control}");
    assert_red(&seeded(1, Fault::Sign, check), "superposition");
    let c = crate::case::Case3::new(
        "compressed column 3D seed",
        dedaliano_engine::metamorphic::planes::embed_2d(
            &c.s,
            dedaliano_engine::metamorphic::planes::Plane::XZ,
        )
        .unwrap(),
    );
    let check = || {
        let mut a = crate::ana3::rows()
            .into_iter()
            .find(|a| a.name == "buckling")
            .unwrap();
        a.run = |c| {
            let original = crate::ana3::rows()
                .into_iter()
                .find(|a| a.name == "buckling")
                .unwrap();
            Ok(perturb((original.run)(c)?))
        };
        let t = Tally::default();
        crate::checks3::check_case(
            &crate::checks3::Ctx {
                tally: &t,
                rng_seed: 1919,
            },
            &c,
            &[a],
            &["superposition"],
        );
        t.replay_results()
    };
    let control = check();
    assert_eq!(control["verdicts"][0]["pass"], 1, "{control}");
    assert_red(&seeded(1, Fault::Sign, check), "superposition");
}

#[test]
fn seeded_failure_replay_reaches_numerical_assertion() {
    let scratch = tempfile::tempdir().unwrap();
    let destination = scratch.path().join("replay-results.json");
    for (fault, code) in [("control", 0), ("sign", 101)] {
        let output = replay_output(&destination, fault);
        assert_eq!(output.status.code(), Some(code), "{output:?}");
        let result: serde_json::Value = serde_json::from_slice(&std::fs::read(&destination).unwrap()).unwrap();
        std::fs::remove_file(&destination).unwrap();
        let stderr = String::from_utf8_lossy(&output.stderr);
        if fault == "sign" {
            assert_red(&result, "rotation");
            assert!(stderr.contains("metamorphic violations:"), "replay failed outside its numerical assertion: {stderr}");
        } else {
            assert!(result["failures"].as_array().unwrap().is_empty(), "{result}");
        }
    }
}

fn replay_output(destination: &std::path::Path, fault: &str) -> std::process::Output {
    std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--ignored", "--exact", "metamorphic_replay", "--nocapture"])
        .env("NIGHTLY_MODEL", concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ex-cantilever-input.json"))
        .env("NIGHTLY_RESULTS", destination)
        .env("METAMORPHIC_SEED", "1919")
        .env("STABILEO_SELFTEST_REPLAY", fault)
        .output().unwrap()
}

#[test]
fn seeded_failure_replay_write_error_names_destination() {
    let scratch = tempfile::tempdir().unwrap();
    for destination in [scratch.path().join("missing/results.json"), scratch.path().to_owned()] {
        let output = replay_output(&destination, "control");
        assert_eq!(output.status.code(), Some(101), "{output:?}");
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(stderr.contains(&destination.display().to_string()), "write error omitted destination {}: {stderr}", destination.display());
        assert!(!stderr.contains("metamorphic violations:"), "{stderr}");
    }
}

#[test]
fn seeded_failure_nightly_reversal_and_symmetry() {
    for (issue, invariant) in [(1970, "reversal"), (1971, "symmetry")] {
        for fault in [Fault::Sign, Fault::Unit, Fault::Stiffness] {
            let mut c = crate::nightly_harness::witness(issue);
            if invariant == "symmetry" {
                let mut tip = c.s.nodes["2"].clone();
                tip.id = 3;
                let start = c.s.nodes["1"].clone();
                let mid = c.s.nodes.get_mut("2").unwrap();
                mid.x = start.x + (tip.x - start.x) * 0.5;
                mid.z = start.z + (tip.z - start.z) * 0.5;
                c.s.nodes.insert("3".into(), tip);
                let mut element = c.s.elements["1"].clone();
                (element.id, element.node_i, element.node_j) = (2, 2, 3);
                c.s.elements.get_mut("1").unwrap().hinge_end = false;
                c.s.elements.insert("2".into(), element);
                let mut loads = Vec::new();
                for load in &mut c.s.loads {
                    if let dedaliano_engine::types::SolverLoad::Distributed(d) = load {
                        let mut next = d.clone();
                        next.element_id = 2;
                        d.q_j = (d.q_i + d.q_j) * 0.5;
                        next.q_i = d.q_j;
                        loads.push(dedaliano_engine::types::SolverLoad::Distributed(next));
                    }
                }
                c.s.loads.extend(loads);
            }
            let c3 = crate::case::Case3::new(c.name.clone(), dedaliano_engine::metamorphic::planes::embed_2d(&c.s, dedaliano_engine::metamorphic::planes::Plane::XZ).unwrap());
            let check2 = || {
                let mut a = crate::ana2::rows().into_iter().find(|a| a.name == "linear").unwrap();
                a.run = static_2d;
                let t = Tally::default();
                if invariant == "symmetry" {
                    let sym = crate::symmetry::symmetrize_2d(&c.name, &c.s, true).unwrap();
                    crate::symmetry::check_2d(&t, &sym, true, &[a]);
                } else {
                    crate::checks2::check_case(&crate::checks2::Ctx { tally: &t, rng_seed: 1919 }, &c, &[a], &[invariant]);
                }
                t.replay_results()
            };
            let control = check2();
            assert_eq!(control["verdicts"][0]["pass"], 1, "{control}");
            assert_red(&seeded(if invariant == "symmetry" { 0 } else { 1 }, fault, check2), invariant);
            let check3 = || {
                let mut a = crate::ana3::rows().into_iter().find(|a| a.name == "linear").unwrap();
                a.run = static_3d;
                let t = Tally::default();
                if invariant == "symmetry" {
                    let sym = crate::symmetry::symmetrize_3d(&c3.name, &c3.s, true).unwrap();
                    crate::symmetry::check_3d(&t, &sym, true, &[a]);
                } else {
                    crate::checks3::check_case(&crate::checks3::Ctx { tally: &t, rng_seed: 1919 }, &c3, &[a], &[invariant]);
                }
                t.replay_results()
            };
            let control = check3();
            assert_eq!(control["verdicts"][0]["pass"], 1, "{control}");
            assert_red(&seeded(if invariant == "symmetry" { 0 } else { 1 }, fault, check3), invariant);
        }
    }
}
