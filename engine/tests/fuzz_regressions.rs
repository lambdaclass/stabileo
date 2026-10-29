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

fn buckling_741_input() -> dedaliano_engine::types::SolverInput3D {
    let bytes = include_bytes!("../fuzz/regressions/json_dynamics/issue-741");
    assert_eq!(bytes[0] % 20, 7);
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

#[test]
fn buckling_741_certificate_contains_reported_and_reference_factors() {
    use dedaliano_engine::certify::buckling::{certify_buckling_3d, BucklingCertificate};
    use dedaliano_engine::solver::buckling::buckling_system_3d;
    let input = buckling_741_input();
    let out = certify_buckling_3d(&input, 3).unwrap();
    let sys = buckling_system_3d(&input).unwrap();
    assert!(exact_pencil_positive(&sys.k_ff, &sys.neg_kg_csc, 0.0));
    let (mut lo, mut hi) = (4600.0, 4800.0);
    assert!(exact_pencil_positive(&sys.k_ff, &sys.neg_kg_csc, lo));
    assert!(!exact_pencil_positive(&sys.k_ff, &sys.neg_kg_csc, hi));
    for _ in 0..24 {
        let mid = (lo + hi) / 2.0;
        if exact_pencil_positive(&sys.k_ff, &sys.neg_kg_csc, mid) { lo = mid; } else { hi = mid; }
    }
    eprintln!("exact-rational dense inertia eigenvalue bracket: [{lo:.12}, {hi:.12}]; reported: {:.12}; certificate: {:?}", out.results.modes[0].load_factor, out.certificate);
    assert!(lo > 4688.9203 && hi < 4688.9204);
    assert!(exact_pencil_positive(&sys.k_ff, &sys.neg_kg_csc, 4644.4835783707595));
    assert!(!exact_pencil_positive(&sys.k_ff, &sys.neg_kg_csc, 4688.92209616787));
    if let BucklingCertificate::Certified { lambda_lower, lambda_upper, lambda_computed } = out.certificate {
        let upper = lambda_upper.unwrap();
        assert!(lambda_lower <= hi && lo <= upper, "reference [{lo}, {hi}] outside [{lambda_lower}, {upper}]");
        assert!(exact_pencil_positive(&sys.k_ff, &sys.neg_kg_csc, lambda_lower));
        assert!(!exact_pencil_positive(&sys.k_ff, &sys.neg_kg_csc, upper));
        assert!(lambda_lower <= lambda_computed && lambda_computed <= upper, "reported {lambda_computed} outside [{lambda_lower}, {upper}]");
    } else if let BucklingCertificate::Uncertified { reason } = out.certificate {
        assert!(reason.contains("exceeds certified upper bound"), "{reason}");
    }
}

fn generated_buckling_enclosures(cases: u64) {
    use dedaliano_engine::certify::buckling::{certify_buckling_2d, certify_buckling_3d, BucklingCertificate};
    use rand::{Rng, SeedableRng};
    let mut rng = rand::rngs::StdRng::seed_from_u64(741);
    let mut certified = [0; 2];
    let mut refused = [0; 2];
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
        let mut value = serde_json::to_value(&input).unwrap();
        value["loads"][0]["data"]["qYI"] = json!(-10f64.powf(rng.gen_range(0.0..10.0)));
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
            certify_buckling_2d(&column, 3).map(|o| (o.certificate, o.results.modes[0].load_factor)),
            certify_buckling_3d(&input, 3).map(|o| (o.certificate, o.results.modes[0].load_factor)),
        ];
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
                    BucklingCertificate::Uncertified { .. } => refused[dimension] += 1,
                },
                Err(reason) => *errors[dimension].entry(reason).or_insert(0u64) += 1,
            }
        }
    }
    for dimension in 0..2 {
        let reached_checker = certified[dimension] + refused[dimension];
        let solver_errors: u64 = errors[dimension].values().sum();
        eprintln!(
            "{}D: {cases} generated, {reached_checker} reached certification, {} certified, {} refused, {solver_errors} solver errors: {:#?}",
            dimension + 2, certified[dimension], refused[dimension], errors[dimension]
        );
        assert_eq!(reached_checker + solver_errors, cases);
    }
    assert_eq!(certified[0], cases, "every generated 2D column must certify");
    assert!(certified[1] > 0, "no generated 3D certificates");
    assert!(certified[1] + refused[1] >= cases / 8, "too few 3D cases reached certification");
    assert!(refused[1] > 0, "no generated 3D refusals");
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
