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
/// killing the whole run. True only when the copy ran that one test and it passed.
fn within_limits(fixture: &std::path::Path, timeout: std::time::Duration, kib: u64) -> bool {
    use std::io::Read;
    let test = format!("{}::plastic_3d_certificate_of_one_nightly_input", module_path!().split_once("::").map_or("", |m| m.1));
    let exe = std::env::current_exe().unwrap();
    let mut child = std::process::Command::new("sh")
        .args(["-c", &format!("ulimit -v {kib} && exec \"$0\" \"$@\""), exe.to_str().unwrap(), "--exact", &test, "--ignored", "--test-threads=1"])
        .env("FUZZ_PLASTIC_FIXTURE", fixture)
        .stdout(std::process::Stdio::piped())
        .spawn().unwrap();
    let mut stdout = child.stdout.take().unwrap();
    let reader = std::thread::spawn(move || { let mut out = String::new(); let _ = stdout.read_to_string(&mut out); out });
    let start = std::time::Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().unwrap() {
            break Some(status);
        }
        if start.elapsed() > timeout {
            child.kill().unwrap();
            child.wait().unwrap();
            break None;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    };
    let out = reader.join().unwrap();
    eprintln!("{}: {status:?} after {:?}", fixture.display(), start.elapsed());
    status.is_some_and(|s| s.success()) && out.contains("test result: ok. 1 passed")
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
fn a_fixture_past_its_limits_fails() {
    let f = std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/fuzz-json-plastic")).read_dir().unwrap().next().unwrap().unwrap().path();
    assert!(!within_limits(&f, std::time::Duration::from_millis(1), 4 << 20), "killed at its timeout");
    assert!(!within_limits(&f, std::time::Duration::from_secs(300), 1 << 10), "out of memory");
    assert!(!within_limits(std::path::Path::new("/nonexistent"), std::time::Duration::from_secs(300), 4 << 20), "a missing fixture");
}
