//! Regressions found by the cargo-fuzz targets (engine/fuzz,
//! docs/verification/FUZZ_MUTANTS.md): every number in an `Ok` result of a
//! WASM entry point is finite unless its field documents +∞.

use dedaliano_engine::certify::dynamics::certify_time_history_3d;
use dedaliano_engine::certify::harmonic::{certify_harmonic_2d, HarmonicCertificate};
use dedaliano_engine::solver::harmonic::HarmonicInput;
use dedaliano_engine::types::TimeHistoryInput3D;
use serde_json::json;

/// json_dynamics: a simply supported beam whose target DOF (axial, at the
/// roller) the load does not excite. ũ_t = 0 made the interval sum of squares
/// [−5e−324, …] and its square root NaN, so a "certified" result carried NaN
/// amplitude enclosures and error bounds.
#[test]
fn harmonic_zero_response_is_finite() {
    let input: HarmonicInput = serde_json::from_value(json!({
        "dampingRatio": 0.05, "densities": { "1": 7850.0 }, "frequencies": [0.5, 2.0, 8.0],
        "responseDof": "x", "responseNodeId": 2,
        "solver": {
            "nodes": { "1": { "id": 1, "x": 0, "y": 0 }, "2": { "id": 2, "x": 5.546562490053475, "y": 0 } },
            "materials": { "1": { "id": 1, "e": 200000, "nu": 0.3 } },
            "sections": { "1": { "id": 1, "a": 0.036127987215295435, "iz": 0.0006057270002784208 } },
            "elements": { "1": { "id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1 } },
            "supports": { "1": { "id": 1, "nodeId": 1, "type": "pinned" }, "2": { "id": 2, "nodeId": 2, "type": "rollerX" } },
            "loads": [
                { "type": "distributed", "data": { "elementId": 1, "qI": -16.29882680857554, "qJ": -3.3391052349470556 } },
                { "type": "nodal", "data": { "nodeId": 1, "fx": -6.373789701610804, "fy": -19.225311417831108, "mz": 0 } }
            ]
        }
    }))
    .unwrap();
    let out = certify_harmonic_2d(&input).unwrap();
    let HarmonicCertificate::Certified { points, peak_amplitude, max_reported_error, reported_within, .. } = out.certificate else {
        panic!("expected a certificate: {:?}", out.certificate);
    };
    assert!(reported_within);
    assert!(peak_amplitude.lo == 0.0 && peak_amplitude.hi.is_finite() && max_reported_error.is_finite());
    for p in &points {
        assert!(p.amplitude.lo == 0.0 && p.amplitude.hi.is_finite() && p.amplitude.hi < 1e-15, "{p:?}");
        assert!(p.reported_error.is_finite() && p.reported_error < 1e-15, "{p:?}");
    }
}

/// json_dynamics: a 3D frame with every translation restrained under a ground
/// acceleration along X stays at rest. The relative update residuals divided
/// the subnormal interval residual of exact zeros by max‖u‖ = 0 and reported
/// +∞ (`null` in JSON, read as a number by the web).
#[test]
fn time_history_zero_solution_residuals_are_finite() {
    let sup = |n: usize, rot: bool| {
        json!({ "nodeId": n, "rx": true, "ry": true, "rz": true, "rrx": rot, "rry": rot, "rrz": rot })
    };
    let input: TimeHistoryInput3D = serde_json::from_value(json!({
        "timeStep": 0.01, "nSteps": 40, "densities": { "1": 7850.0 }, "groundAccelX": vec![0.5; 40],
        "solver": {
            "nodes": {
                "1": { "id": 1, "x": 0, "y": 0, "z": 0 },
                "2": { "id": 2, "x": 7.312289858935401, "y": 0, "z": 0 },
                "3": { "id": 3, "x": 2.882278245132921, "y": 0, "z": 2.6604336351156235 }
            },
            "materials": { "1": { "id": 1, "e": 200000, "nu": 0.3 } },
            "sections": { "1": { "id": 1, "a": 0.00538, "iy": 0.00008356, "iz": 0.00000604, "j": 2.01e-7 } },
            "elements": {
                "1": { "id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1 },
                "2": { "id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1 }
            },
            "supports": { "1": sup(1, true), "2": sup(2, false), "3": sup(3, false) },
            "loads": []
        }
    }))
    .unwrap();
    let out = certify_time_history_3d(&input).unwrap();
    let r = out.certificate.residual.expect("residual report");
    assert!(r.max_rel_displacement_update.is_finite() && r.max_rel_displacement_update < 1e-12, "{r:?}");
    assert!(r.max_rel_velocity_update.is_finite() && r.max_rel_velocity_update < 1e-12, "{r:?}");
}

/// json_dynamics (issue #335): the crash input of nightly run 39125781094,
/// kept as `fuzz/regressions/json_dynamics/crash-28fad1…` (selector byte 11 =
/// `certify_spectral_3d`, then the parameter byte, then the JSON). Mode 3 has
/// ω < 0: the CQC ratio ω_j/ω_i was negative, r^1.5 NaN, and every combined
/// displacement and force NaN; the certificate still said "certified" with
/// error bounds of 0, because `f64::max` drops NaN. The solver now refuses
/// ω ≤ 0, and no certificate passes on a non-finite number
/// (`tests/certify_nonfinite.rs` for every kind).
#[test]
fn spectral_negative_omega_is_refused() {
    use dedaliano_engine::certify::spectral::{certify_spectral_3d, certify_spectral_results_3d};
    use dedaliano_engine::solver::spectral::solve_spectral_3d;
    use dedaliano_engine::types::SpectralInput3D;
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/fuzz/regressions/json_dynamics/crash-28fad1caf98555e982aa0a8f1c1fbf0b1d2aa934"
    );
    let bytes = std::fs::read(path).unwrap();
    assert_eq!(bytes[0] % 20, 11, "selector: certify_spectral_3d");
    let mut input: SpectralInput3D = serde_json::from_slice(&bytes[2..]).unwrap();
    assert!(input.modes[2].omega < 0.0);
    let e = certify_spectral_3d(&input).unwrap_err();
    assert!(e.contains("omega") && e.contains("mode 3"), "{e}");
    assert!(solve_spectral_3d(&input).is_err());

    // With ω > 0 the same model solves and certifies, all finite.
    input.modes[2].omega = -input.modes[2].omega;
    let out = certify_spectral_3d(&input).unwrap();
    assert!(dedaliano_engine::certify::finite::non_finite_paths(&out).is_empty());
    assert!(out.certificate.is_certified(), "{:?}", out.certificate);

    // Reported NaN values are never certified (they were, with bound 0).
    let mut bad = out.results.clone();
    bad.displacements[5].ux = f64::NAN;
    assert!(!certify_spectral_results_3d(&input, &bad).is_certified());
    let mut bad = out.results.clone();
    bad.element_forces[0].n_max = f64::NAN;
    assert!(!certify_spectral_results_3d(&input, &bad).is_certified());
}

/// The enclosure's error bound of a NaN or infinite value is +∞, never 0.
#[test]
fn spectral_enclosure_error_of_non_finite_is_infinite() {
    use dedaliano_engine::certify::spectral::Enclosure;
    let e = Enclosure { lo: 1.0, hi: 2.0 };
    assert_eq!(e.error_of(f64::NAN), f64::INFINITY);
    assert_eq!(e.error_of(f64::INFINITY), f64::INFINITY);
    assert!(e.error_of(1.5) <= 0.5 + 1e-15);
}

/// json_plastic (issues #951 #952 #953 #989 #990 #991): selector 3
/// (`certify_plastic_3d`) on the seed corpus's 8-member 3D portal with mutated
/// keys. They were not crashes: libFuzzer's slow-unit reports and a process
/// RSS that grew to 2 GB over the run (84 MB live heap), charged to whichever
/// input was running. Alone, each certifies within 25 MB.
#[test]
fn plastic_3d_certificate_nightly_inputs_finish() {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/fuzz-json-plastic");
    let mut files: Vec<_> = std::fs::read_dir(dir).unwrap().map(|e| e.unwrap().path()).collect();
    files.sort();
    assert_eq!(files.len(), 6);
    for f in files {
        assert!(within_limits(&f, std::time::Duration::from_secs(300), 4 << 20), "{}", f.display());
    }
}

/// Certifies one fixture in a fresh copy of this test binary under a virtual memory limit (KiB),
/// killed at `timeout`, so a hang or a runaway allocation fails the test instead of stalling or
/// killing the whole run. True only when the copy ran that one test and it passed in time.
fn within_limits(fixture: &std::path::Path, timeout: std::time::Duration, kib: u64) -> bool {
    within_limits_test(fixture, timeout, kib, "plastic_3d_certificate_of_one_nightly_input")
}

fn within_limits_test(fixture: &std::path::Path, timeout: std::time::Duration, kib: u64, name: &str) -> bool {
    let test = format!("{}::{name}", module_path!().split_once("::").map_or("", |m| m.1));
    let exe = std::env::current_exe().unwrap();
    let mut command = std::process::Command::new("sh");
    command.args(["-c", &format!("ulimit -v {kib} && exec \"$0\" \"$@\""), exe.to_str().unwrap(), "--exact", &test, "--ignored", "--test-threads=1"])
        .env("FUZZ_PLASTIC_FIXTURE", fixture);
    let passed = run_limited(command, timeout);
    eprintln!("{}: {passed:?}", fixture.display());
    passed.is_some_and(|out| out.contains("test result: ok. 1 passed"))
}

/// The standard output of `command` when it exits successfully before `timeout`; `None` when it
/// fails, or is still running or finishes only after `timeout` (then it is killed).
fn run_limited(mut command: std::process::Command, timeout: std::time::Duration) -> Option<String> {
    use std::io::Read;
    let start = std::time::Instant::now();
    let mut child = command.stdout(std::process::Stdio::piped()).spawn().unwrap();
    let mut stdout = child.stdout.take().unwrap();
    let reader = std::thread::spawn(move || { let mut out = String::new(); let _ = stdout.read_to_string(&mut out); out });
    let status = loop {
        let status = child.try_wait().unwrap();
        if start.elapsed() > timeout {
            if status.is_none() {
                child.kill().unwrap();
                child.wait().unwrap();
            }
            break None;
        }
        if status.is_some() {
            break status;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    };
    status.filter(|s| s.success()).map(|_| reader.join().unwrap())
}

/// The 10.125 is the z-sway mechanism: four column-base hinges (Mp_y =
/// 250e3·0.15·0.3²/4 = 843.75 kN·m) and four transverse-beam end hinges
/// (Mp_z = 250e3·0.3·0.15²/4 = 421.875 kN·m) rotate δ/4 under 5 + 2·10·6 =
/// 125 kN along z: λ = (843.75 + 421.875)/125.
#[test]
#[ignore = "run by plastic_3d_certificate_nightly_inputs_finish in a limited subprocess"]
fn plastic_3d_certificate_of_one_nightly_input() {
    use dedaliano_engine::certify::plastic_3d::certify_plastic_3d;
    use dedaliano_engine::types::PlasticInput3D;
    let f = std::path::PathBuf::from(std::env::var_os("FUZZ_PLASTIC_FIXTURE").expect("FUZZ_PLASTIC_FIXTURE names the fixture"));
    let name = f.file_name().unwrap().to_string_lossy().into_owned();
    let input: PlasticInput3D = serde_json::from_slice(&std::fs::read(&f).unwrap()).unwrap();
    let c = certify_plastic_3d(&input).unwrap().certificate;
    let (lo, hi) = (c.lambda_lower.unwrap(), c.lambda_upper.unwrap());
    assert!(c.certified && lo <= hi && hi - lo < 1e-4 * hi, "{name}: {c:?}");
    if !name.starts_with("991-") {
        assert!(lo <= 10.125 && 10.125 <= hi && hi - lo < 1e-9, "{name}: [{lo}, {hi}]");
    }
}

#[test]
fn issue_1760_plastic_input_finishes_in_a_fresh_process() {
    let fixture = std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/fuzz/regressions/json_plastic/oom-1d283e64888730445219207f88a5a98edb5ade90"));
    assert!(within_limits_test(fixture, std::time::Duration::from_secs(60), 2 << 20, "issue_1760_plastic_input_in_a_fresh_process"));
}

#[test]
#[ignore = "run by issue_1760_plastic_input_finishes_in_a_fresh_process in a limited subprocess"]
fn issue_1760_plastic_input_in_a_fresh_process() {
    use dedaliano_engine::certify::plastic_3d::certify_plastic_3d;
    use dedaliano_engine::types::PlasticInput3D;
    let f = std::path::PathBuf::from(std::env::var_os("FUZZ_PLASTIC_FIXTURE").expect("FUZZ_PLASTIC_FIXTURE names the fixture"));
    let bytes = std::fs::read(&f).unwrap();
    let input: PlasticInput3D = serde_json::from_slice(&bytes[2..]).unwrap();
    let c = certify_plastic_3d(&input).unwrap().certificate;
    let (lo, hi) = (c.lambda_lower.unwrap(), c.lambda_upper.unwrap());
    assert!(c.certified && lo <= hi && hi - lo < 1e-4 * hi, "{c:?}");
}

#[test]
#[ignore = "wall-clock budget: run by make test.engine.gates"]
fn a_blocking_child_is_killed_at_its_timeout() {
    let mut sleeper = std::process::Command::new("sh");
    sleeper.args(["-c", "exec sleep 30"]);
    let start = std::time::Instant::now();
    assert_eq!(run_limited(sleeper, std::time::Duration::from_secs(1)), None);
    assert!(start.elapsed() < std::time::Duration::from_secs(10));
}

#[test]
fn a_fixture_past_its_limits_fails() {
    let shell = |script: &str| { let mut c = std::process::Command::new("sh"); c.args(["-c", script]); c };
    let second = std::time::Duration::from_secs(1);
    assert_eq!(run_limited(shell("echo done"), second).as_deref(), Some("done\n"));
    assert_eq!(run_limited(shell("exec sleep 30"), second), None, "a blocking child is killed at its timeout");
    assert_eq!(run_limited(shell("exec sleep 0.2"), std::time::Duration::from_millis(100)), None, "finishing after the timeout fails");
    assert_eq!(run_limited(shell("exit 3"), second), None);
    let f = std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/fuzz-json-plastic")).read_dir().unwrap().next().unwrap().unwrap().path();
    assert!(!within_limits(&f, std::time::Duration::from_secs(300), 1 << 10), "out of memory");
    assert!(!within_limits(std::path::Path::new("/nonexistent"), std::time::Duration::from_secs(300), 4 << 20), "a missing fixture");
}

fn buckling_741_input() -> dedaliano_engine::types::SolverInput3D {
    let bytes = include_bytes!("../fuzz/regressions/json_dynamics/issue-741");
    assert_eq!(bytes[0], 0x07);
    assert_eq!(bytes[1], b'R');
    serde_json::from_slice(&bytes[2..]).unwrap()
}

fn exact_pencil_positive(
    k: &dedaliano_engine::linalg::sparse::CscMatrix,
    n: &dedaliano_engine::linalg::sparse::CscMatrix,
    lambda: f64,
) -> bool {
    use num_rational::BigRational;
    use num_traits::{Zero, Signed};
    let mut a = vec![vec![BigRational::zero(); k.n]; k.n];
    for (m, scale) in [(k, BigRational::from_integer(1.into())), (n, -BigRational::from_float(lambda).unwrap())] {
        for j in 0..m.n {
            for p in m.col_ptr[j]..m.col_ptr[j + 1] {
                let i = m.row_idx[p];
                let v = BigRational::from_float(m.values[p]).unwrap() * &scale;
                a[i][j] += &v;
                if i != j { a[j][i] += v; }
            }
        }
    }
    for j in 0..k.n {
        if !a[j][j].is_positive() { return false; }
        for i in j + 1..k.n {
            for h in i..k.n {
                let correction = &a[i][j] * &a[h][j] / &a[j][j];
                a[h][i] -= correction;
                a[i][h] = a[h][i].clone();
            }
        }
    }
    true
}

fn buckling_741_with_axial_tip_load(p: f64) -> dedaliano_engine::types::SolverInput3D {
    let input = buckling_741_input();
    let (a, b) = (&input.nodes["3"], &input.nodes["4"]);
    let d = [b.x - a.x, b.y - a.y, b.z - a.z];
    let l = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
    let mut value = serde_json::to_value(&input).unwrap();
    value["loads"].as_array_mut().unwrap().push(json!({"type": "nodal", "data": {"nodeId": 4, "fx": -p * d[0] / l, "fy": -p * d[1] / l, "fz": -p * d[2] / l, "mx": 0, "my": 0, "mz": 0}}));
    serde_json::from_value(value).unwrap()
}

#[test]
fn buckling_741_certificate_contains_reported_and_reference_factors() {
    use dedaliano_engine::certify::buckling::{buckling_certificate_3d, certify_buckling_3d, BucklingCertificate, BucklingRefusal::ComputedAboveUpperBound};
    use dedaliano_engine::solver::buckling::{buckling_system_3d, solve_buckling_3d};
    for error in [certify_buckling_3d(&buckling_741_input(), 3).map(|_| ()).unwrap_err(), solve_buckling_3d(&buckling_741_input(), 3).map(|_| ()).unwrap_err()] {
        assert!(error.contains("Buckling not determinable") && error.contains("element 3"), "{error}");
    }
    let input = buckling_741_with_axial_tip_load(100.0);
    assert!(certify_buckling_3d(&input, 3).unwrap_err().contains("BU-BOUND"));
    let certificate = buckling_certificate_3d(&input, 3).unwrap();
    let factor = solve_buckling_3d(&input, 3).unwrap().modes[0].load_factor;
    let sys = buckling_system_3d(&input).unwrap();
    assert!(exact_pencil_positive(&sys.k_ff, &sys.neg_kg_csc, 0.0));
    let (mut lo, mut hi) = (1.0, 1.5);
    assert!(exact_pencil_positive(&sys.k_ff, &sys.neg_kg_csc, lo));
    assert!(!exact_pencil_positive(&sys.k_ff, &sys.neg_kg_csc, hi));
    for _ in 0..40 {
        let mid = (lo + hi) / 2.0;
        if exact_pencil_positive(&sys.k_ff, &sys.neg_kg_csc, mid) { lo = mid; } else { hi = mid; }
    }
    eprintln!("exact-rational dense inertia eigenvalue bracket: [{lo:.15}, {hi:.15}]; reported: {factor:.15}; certificate: {certificate:?}");
    assert!(lo > 1.2087953604 && hi < 1.2087953605, "[{lo}, {hi}]");
    assert!(factor > 1.20879541 && factor > hi, "the reported factor is above the exact one: {factor}");
    refusal_741_holds(&certificate, factor, &sys, hi).unwrap();
    let ComputedAboveUpperBound { lambda_upper, .. } = refusal_of(&certificate).unwrap();
    let doctored = |lambda_computed, lambda_upper| BucklingCertificate::Uncertified {
        reason: "computed load factor exceeds certified upper bound".into(),
        refusal: Some(ComputedAboveUpperBound { lambda_computed, lambda_upper }),
    };
    for wrong in [
        doctored(factor, lo),
        doctored(factor, factor * 2.0),
        doctored(lambda_upper, lambda_upper),
        doctored(factor.next_up(), lambda_upper),
        BucklingCertificate::Uncertified { reason: "computed load factor exceeds certified upper bound".into(), refusal: None },
        BucklingCertificate::Certified { lambda_lower: lo, lambda_upper: Some(lambda_upper), lambda_computed: factor },
    ] {
        assert!(refusal_741_holds(&wrong, factor, &sys, hi).is_err(), "{wrong:?}");
    }
}

fn refusal_of(
    certificate: &dedaliano_engine::certify::buckling::BucklingCertificate,
) -> Option<dedaliano_engine::certify::buckling::BucklingRefusal> {
    match certificate {
        dedaliano_engine::certify::buckling::BucklingCertificate::Uncertified { refusal, .. } => *refusal,
        _ => None,
    }
}

fn refusal_741_holds(
    certificate: &dedaliano_engine::certify::buckling::BucklingCertificate,
    factor: f64,
    sys: &dedaliano_engine::solver::buckling::BucklingSystem3D,
    exact_hi: f64,
) -> Result<(), String> {
    use dedaliano_engine::certify::buckling::{BucklingCertificate, BucklingRefusal::ComputedAboveUpperBound};
    let BucklingCertificate::Uncertified { reason, refusal: Some(ComputedAboveUpperBound { lambda_computed, lambda_upper }) } = certificate else {
        return Err(format!("not a computedAboveUpperBound refusal: {certificate:?}"));
    };
    if !reason.contains("exceeds certified upper bound") {
        return Err(format!("reason: {reason}"));
    }
    if *lambda_computed != factor {
        return Err(format!("refusal cites {lambda_computed}, solver reported {factor}"));
    }
    if !(*lambda_computed > *lambda_upper) {
        return Err(format!("{lambda_computed} does not exceed {lambda_upper}"));
    }
    if !(*lambda_upper >= exact_hi && *lambda_upper - exact_hi <= 1e-6 * exact_hi) {
        return Err(format!("upper bound {lambda_upper} is not a tight bound over the exact bracket top {exact_hi}"));
    }
    if exact_pencil_positive(&sys.k_ff, &sys.neg_kg_csc, *lambda_upper) {
        return Err(format!("K - {lambda_upper} N is positive definite in exact arithmetic"));
    }
    Ok(())
}

fn compression_is_round_off_3d(input: &dedaliano_engine::types::SolverInput3D) -> Result<(), String> {
    if input.loads.iter().any(|l| matches!(l, dedaliano_engine::types::SolverLoad3D::Distributed(d) if d.q_xi != 0.0 || d.q_xj != 0.0)) {
        return Err("an axial span load makes the end forces an incomplete account of the axial force".into());
    }
    let forces = dedaliano_engine::solver::linear::solve_3d(input)?.element_forces;
    let scale = forces.iter().fold(0.0f64, |m, e| m.max(e.n_start.abs()).max(e.n_end.abs()).max(e.vy_start.abs()).max(e.vz_start.abs()));
    let compression = forces.iter().fold(0.0f64, |m, e| m.max(-e.n_start).max(-e.n_end));
    if compression.is_finite() && compression <= 1e-9 * scale { Ok(()) } else { Err(format!("compression {compression:e} of {scale:e}")) }
}

#[test]
fn compression_inside_the_span_is_never_taken_for_round_off() {
    let input: dedaliano_engine::types::SolverInput3D = serde_json::from_value(json!({
        "nodes": { "1": { "id": 1, "x": 0, "y": 0, "z": 0 }, "2": { "id": 2, "x": 4, "y": 0, "z": 0 } },
        "materials": { "1": { "id": 1, "e": 200000, "nu": 0.3 } },
        "sections": { "1": { "id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 1e-4 } },
        "elements": { "1": { "id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1 } },
        "supports": { "1": { "nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true }, "2": { "nodeId": 2, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": false, "rrz": false } },
        "loads": [{ "type": "distributed", "data": { "elementId": 1, "qXI": 10.0, "qXJ": -10.0, "qYI": 0, "qYJ": 0, "qZI": 0, "qZJ": 0 } }]
    })).unwrap();
    let forces = dedaliano_engine::solver::linear::solve_3d(&input).unwrap().element_forces;
    assert!(forces.iter().all(|e| e.n_start >= -1e-9 && e.n_end >= -1e-9), "{:?}", forces.iter().map(|e| (e.n_start, e.n_end)).collect::<Vec<_>>());
    assert!(compression_is_round_off_3d(&input).is_err());
}

fn generated_buckling_enclosures(cases: u64) {
    use dedaliano_engine::certify::buckling::{buckling_certificate_2d, buckling_certificate_3d, certify_buckling_2d, certify_buckling_3d, BucklingCertificate, BucklingRefusal};
    use dedaliano_engine::solver::buckling::{solve_buckling_2d, solve_buckling_3d};
    use rand::{Rng, SeedableRng};
    let mut rng = rand::rngs::StdRng::seed_from_u64(741);
    let mut certified = [0; 2];
    let mut refused = [0; 2];
    let mut above_upper = [0; 2];
    let mut errors = [std::collections::BTreeMap::new(), std::collections::BTreeMap::new()];
    for seed in 0..cases {
        let mut input = buckling_741_input();
        for id in 1..=4 {
            let node = input.nodes.get_mut(&id.to_string()).unwrap();
            node.x *= rng.gen_range(0.8..1.2);
            node.y *= rng.gen_range(0.8..1.2);
            node.z *= rng.gen_range(0.8..1.2);
        }
        input.materials.get_mut("1").unwrap().e *= 10f64.powf(rng.gen_range(-2.0..2.0));
        let q = 10f64.powf(rng.gen_range(0.0..10.0));
        let (a, b) = (&input.nodes["3"], &input.nodes["4"]);
        let d = [b.x - a.x, b.y - a.y, b.z - a.z];
        let l = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
        let p = q * 10f64.powf(rng.gen_range(-9.0..-3.0));
        let mut value = serde_json::to_value(&input).unwrap();
        value["loads"][0]["data"]["qYI"] = json!(-q);
        value["loads"].as_array_mut().unwrap().push(json!({"type": "nodal", "data": {"nodeId": 4, "fx": -p * d[0] / l, "fy": -p * d[1] / l, "fz": -p * d[2] / l, "mx": 0, "my": 0, "mz": 0}}));
        let input = serde_json::from_value(value).unwrap();
        let column = serde_json::from_value(json!({
            "nodes": { "1": { "id": 1, "x": 0, "z": 0 }, "2": { "id": 2, "x": 0, "z": rng.gen_range(1.0..20.0) } },
            "elements": { "1": { "id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1 } },
            "materials": { "1": { "id": 1, "e": 10f64.powf(rng.gen_range(3.0..7.0)), "nu": 0.3 } },
            "sections": { "1": { "id": 1, "a": rng.gen_range(0.001..0.1), "iz": 10f64.powf(rng.gen_range(-7.0..-3.0)) } },
            "supports": { "1": { "id": 1, "nodeId": 1, "type": "fixed" } },
            "loads": [{ "type": "nodal", "data": { "nodeId": 2, "fx": 0, "fz": -10f64.powf(rng.gen_range(-1.0..5.0)), "my": 0 } }]
        })).unwrap();
        let outputs = [
            buckling_certificate_2d(&column, 3).and_then(|c| solve_buckling_2d(&column, 3).map(|r| (c, r.modes[0].load_factor))),
            buckling_certificate_3d(&input, 3).and_then(|c| solve_buckling_3d(&input, 3).map(|r| (c, r.modes[0].load_factor))),
        ];
        let public = [
            certify_buckling_2d(&column, 3).map(|o| o.results.modes[0].load_factor),
            certify_buckling_3d(&input, 3).map(|o| o.results.modes[0].load_factor),
        ];
        for (output, public) in outputs.iter().zip(&public) {
            match output {
                Ok((BucklingCertificate::Uncertified { refusal: Some(BucklingRefusal::ComputedAboveUpperBound { .. }), .. }, _)) => {
                    assert!(public.as_ref().unwrap_err().contains("BU-BOUND"), "seed {seed}: a factor above its bound was returned");
                }
                Ok((_, factor)) => assert_eq!(public.as_ref().ok(), Some(factor), "seed {seed}"),
                Err(_) => assert!(public.is_err(), "seed {seed}"),
            }
        }
        for (dimension, output) in outputs.into_iter().enumerate() {
            match output {
                Ok((certificate, factor)) => match certificate {
                    BucklingCertificate::Certified { lambda_lower, lambda_upper, lambda_computed } => {
                        certified[dimension] += 1;
                        assert_eq!(lambda_computed, factor);
                        assert!(lambda_lower <= factor, "seed {seed}: {certificate:?}");
                        if let Some(upper) = lambda_upper {
                            assert!(factor <= upper, "seed {seed}: {certificate:?}");
                        }
                    }
                    BucklingCertificate::Uncertified { refusal, .. } => {
                        refused[dimension] += 1;
                        if let Some(BucklingRefusal::ComputedAboveUpperBound { lambda_computed, lambda_upper }) = refusal {
                            above_upper[dimension] += 1;
                            assert_eq!(lambda_computed, factor, "seed {seed}");
                            assert!(lambda_computed > lambda_upper, "seed {seed}: {refusal:?}");
                        }
                    }
                },
                Err(reason) => {
                    if dimension == 1 && reason == "No positive buckling load factors found" {
                        if let Err(e) = compression_is_round_off_3d(&input) { panic!("seed {seed}: no positive factor, {e}"); }
                    }
                    *errors[dimension].entry(reason).or_insert(0u64) += 1
                }
            }
        }
    }
    for dimension in 0..2 {
        let reached_checker = certified[dimension] + refused[dimension];
        let solver_errors: u64 = errors[dimension].values().sum();
        eprintln!(
            "{}D: {cases} generated, {reached_checker} reached certification, {} certified, {} refused ({} computedAboveUpperBound), {solver_errors} solver errors: {:#?}",
            dimension + 2, certified[dimension], refused[dimension], above_upper[dimension], errors[dimension]
        );
        assert!(
            errors[dimension].keys().all(|reason| *reason == dedaliano_engine::refusal::no_compressed_elements() || (dimension == 1 && (reason == "No positive buckling load factors found" || reason.starts_with("Buckling not determinable")))),
            "{}D solver failed for a reason other than no (resolvable) compression: {:#?}", dimension + 2, errors[dimension]
        );
    }
    assert_eq!(certified[0], cases, "every generated 2D column must certify");
    assert!(certified[1] > 0, "no generated 3D certificates");
    assert!(certified[1] + refused[1] >= cases / 8, "too few 3D cases reached certification");
    assert!(above_upper[1] > 0, "no generated 3D computedAboveUpperBound refusals");
}

#[test]
fn generated_buckling_certificate_invariant() {
    generated_buckling_enclosures(64);
}

#[test]
#[ignore]
fn generated_buckling_certificate_invariant_nightly() {
    generated_buckling_enclosures(4096);
}

/// json_static (issue #1350): selector byte 17 is `compute_envelope_3d`. The
/// first result's element 3 has `vzStart` ≈ −5.29e307, finite, but My at
/// x = 0.5 L of its 7.26 m span is beyond f64.
#[test]
fn envelope_3d_overflow_is_refused() {
    use dedaliano_engine::postprocess::combinations::compute_envelope_3d;
    use dedaliano_engine::types::AnalysisResults3D;
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/fuzz/regressions/json_static/crash-03289a314e8188c2f582ec02666b9b972abcbdc0"
    );
    let bytes = std::fs::read(path).unwrap();
    assert_eq!(bytes[0] % 18, 17, "selector: compute_envelope_3d");
    let mut results: Vec<AnalysisResults3D> = serde_json::from_slice(&bytes[2..]).unwrap();
    assert!(results[0].element_forces[2].vz_start < -1e307);

    let e = compute_envelope_3d(&results).unwrap_err();
    assert!(e.contains("momentY") && e.contains("element 3") && e.contains("result 0"), "{e}");

    results[0].element_forces[2].vz_start = results[1].element_forces[2].vz_start;
    let env = compute_envelope_3d(&results).unwrap();
    assert!(dedaliano_engine::certify::finite::non_finite_paths(&env).is_empty());
    let my = &env.moment_y.elements[2];
    let ef = &results[1].element_forces[2];
    assert_eq!(my.neg_values[0], ef.my_start.min(0.0));
    assert!(my.neg_values.iter().all(|v| v.is_finite() && *v <= 0.0));
}

#[test]
fn issue_1759_buckling_rejects_negative_truss_inertia() {
    use dedaliano_engine::solver::buckling::{solve_buckling_2d, solve_buckling_3d};
    use dedaliano_engine::types::{SolverInput, SolverInput3D};
    let bytes = include_bytes!("../fuzz/regressions/json_dynamics/crash-828fb1b1282a6154226085839f502cc6703cace8.min");
    assert_eq!(bytes[0] % 20, 5);
    let input_3d: SolverInput3D = serde_json::from_slice(&bytes[2..]).unwrap();
    let error = solve_buckling_3d(&input_3d, 3).unwrap_err();
    assert!(error.contains("Section 1") && error.contains("inertia"), "{error}");

    for (iy, iz) in [(1e-28, 1e-4), (1e-4, 1e-28)] {
        let mut tiny_radius_3d = input_3d.clone();
        let sec = tiny_radius_3d.sections.get_mut("1").unwrap();
        sec.iy = iy;
        sec.iz = iz;
        let error = solve_buckling_3d(&tiny_radius_3d, 3).unwrap_err();
        assert!(error.contains("Section 1") && error.contains("radii of gyration"), "{error}");
    }

    let mut overflow_3d = input_3d.clone();
    let sec = overflow_3d.sections.get_mut("1").unwrap();
    sec.iy = 1e305;
    sec.iz = 1e305;
    let error = solve_buckling_3d(&overflow_3d, 3).unwrap_err();
    assert!(error.contains("non_finite_result"), "{error}");

    let truss_2d = |iz: f64| -> SolverInput {
        serde_json::from_value(json!({
            "nodes": { "1": { "id": 1, "x": 0.0, "z": 0.0 }, "2": { "id": 2, "x": 0.0, "z": 4.0 } },
            "materials": { "1": { "id": 1, "e": 200000.0, "nu": 0.3 } },
            "sections": { "1": { "id": 1, "a": 0.01, "iz": iz } },
            "elements": { "1": { "id": 1, "type": "truss", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1 } },
            "supports": {
                "1": { "id": 1, "nodeId": 1, "type": "spring", "kx": 1000.0, "ky": 5e5 },
                "2": { "id": 2, "nodeId": 2, "type": "pinned" }
            },
            "loads": [{ "type": "pointOnElement", "data": { "elementId": 1, "a": 1.0, "p": 0.0, "px": 100.0 } }]
        })).unwrap()
    };

    let error = solve_buckling_2d(&truss_2d(-0.0001), 1).unwrap_err();
    assert!(error.contains("Section 1") && error.contains("inertia"), "{error}");

    let error = solve_buckling_2d(&truss_2d(1e-28), 1).unwrap_err();
    assert!(error.contains("Section 1") && error.contains("radius of gyration"), "{error}");

    let error = solve_buckling_2d(&truss_2d(1e305), 1).unwrap_err();
    assert!(error.contains("non_finite_result"), "{error}");
}

#[test]
fn issue_1761_multi_case_overflow_is_refused() {
    use dedaliano_engine::solver::load_cases::{
        solve_multi_case_2d, solve_multi_case_3d, MultiCaseInput, MultiCaseInput3D,
    };
    use dedaliano_engine::types::{Constraint, EqualDOFConstraint};
    let bytes = include_bytes!("../fuzz/regressions/json_static/crash-0e89be15b950870b2e17a3d6d7a842708a882ac7.min");
    assert_eq!(bytes[0] % 18, 11);
    let input_3d: MultiCaseInput3D = serde_json::from_slice(&bytes[2..]).unwrap();
    let error = solve_multi_case_3d(&input_3d).unwrap_err();
    assert!(error.contains("non_finite_result"), "{error}");

    let mut per_case_3d = input_3d.clone();
    per_case_3d.solver.supports.get_mut("1").unwrap().dz = Some(-1e-4);
    per_case_3d.solver.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 3,
        slave_node: 4,
        dofs: vec![0],
    }));
    let error = solve_multi_case_3d(&per_case_3d).unwrap_err();
    assert!(error.contains("non_finite_result"), "{error}");

    let input_2d: MultiCaseInput = serde_json::from_value(json!({
        "combinations": [{ "name": "1.2D+1.6L", "factors": { "D": 1.2, "L": 1.6 } }],
        "loadCases": [
            {
                "name": "D",
                "loads": [{ "type": "distributed", "data": { "elementId": 2, "qI": -10.0, "qJ": -10.0 } }]
            },
            {
                "name": "L",
                "loads": [{ "type": "distributed", "data": { "elementId": 2, "qI": -8.166543330997e229, "qJ": -18.0 } }]
            }
        ],
        "solver": {
            "nodes": {
                "1": { "id": 1, "x": 0.0, "z": 0.0 },
                "2": { "id": 2, "x": 3.0, "z": 0.0 },
                "3": { "id": 3, "x": 6.0, "z": 0.0 }
            },
            "materials": { "1": { "id": 1, "e": 200000.0, "nu": 0.3 } },
            "sections": { "1": { "id": 1, "a": 0.00538, "iz": 6.04e-6 } },
            "elements": {
                "1": { "id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1 },
                "2": { "id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1 }
            },
            "supports": {
                "1": { "id": 1, "nodeId": 1, "type": "fixed" },
                "2": { "id": 2, "nodeId": 2, "type": "pinned" }
            },
            "loads": []
        }
    })).unwrap();
    let error = solve_multi_case_2d(&input_2d).unwrap_err();
    assert!(error.contains("non_finite_result"), "{error}");

    let mut per_case_2d = input_2d.clone();
    per_case_2d.solver.supports.get_mut("1").unwrap().dz = Some(-1e-4);
    per_case_2d.solver.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 2,
        slave_node: 3,
        dofs: vec![0],
    }));
    let error = solve_multi_case_2d(&per_case_2d).unwrap_err();
    assert!(error.contains("non_finite_result"), "{error}");
}

