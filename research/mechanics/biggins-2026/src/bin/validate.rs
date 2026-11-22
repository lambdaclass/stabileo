use arches_biggins_2026::{basis, run, threshold};
use serde_json::{json, Value};
use std::{fs, path::Path};
fn main() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let result = run(0.7, 0.012).unwrap();
    let reference: Vec<[f64; 2]> = serde_json::from_str(
        &fs::read_to_string(root.join("reference-results/thresholds.json")).unwrap(),
    )
    .unwrap();
    let curve_error = result
        .curve
        .iter()
        .zip(&reference)
        .map(|(a, b)| {
            assert_eq!(a[0], b[0]);
            (a[1] / b[1] - 1.).abs()
        })
        .fold(0., f64::max);
    let refined = basis(96, 24).unwrap();
    let mesh_error = result
        .curve
        .iter()
        .map(|p| (p[1] / threshold(&refined, p[0]).0 - 1.).abs())
        .fold(0., f64::max);
    let check = |metric: &str, observed: f64, tolerance: f64| json!({"metric":metric,"observed":observed,"tolerance":tolerance,"passed":observed<=tolerance});
    let checks = vec![
        check(
            "max relative threshold error against 31 Zenodo software outputs",
            curve_error,
            0.003,
        ),
        check(
            "64 elements / 16 modes vs 96 elements / 24 modes: max relative threshold change",
            mesh_error,
            0.001,
        ),
        check(
            "Euler f0 relative error",
            (result.modes[0].force / (4. * std::f64::consts::PI.powi(2)) - 1.).abs(),
            1e-5,
        ),
        check(
            "Euler f1 relative error",
            (result.modes[1].force / 80.7629142257 - 1.).abs(),
            1e-5,
        ),
    ];
    let row = |id: &str, name: &str, source: &str, reference: f64, computed: f64, metric: &str, tolerance: f64| {
        let difference = (computed - reference).abs();
        let observed = if metric.starts_with("relative") { difference / reference.abs() } else { difference };
        json!({"id":id,"name":name,"source":source,"unit":"","reference":reference,"computed":computed,"metric":metric,"observed":observed,"tolerance":tolerance,"passed":observed<=tolerance})
    };
    let pi = std::f64::consts::PI;
    let published = vec![
        row(
            "threshold-70",
            "Snap threshold α/√ε, centered pattern over 70% of the span",
            "Zmyślony et al., doi:10.1103/56f8-8gsx; arXiv:2601.06598v2 p.3 following Eq.(2), Eq.(3) p.4, supplementary Table S1 p.8 (PDF p.17)",
            21.52,
            result.threshold / result.compression.sqrt(),
            "absolute error",
            0.005,
        ),
        row(
            "k1",
            "First antisymmetric Euler mode of the flat clamped beam, wavenumber k₁/π",
            "arXiv:2601.06598v2, supplementary S2.6.1: k₁ = 2.86π (f_i = k_i²)",
            2.86,
            result.modes[1].force.sqrt() / pi,
            "absolute error",
            0.005,
        ),
        row(
            "k0",
            "Fundamental Euler mode of the flat clamped beam, wavenumber k₀/π",
            "arXiv:2601.06598v2, supplementary S2.6.1: k₀ = 2π (f_i = k_i²)",
            2.,
            result.modes[0].force.sqrt() / pi,
            "relative error",
            1e-5,
        ),
    ];
    let files = [
        (
            "VALIDATION.json",
            json!({"checks":checks,"published_checks":published.clone(),"scope":"Production Euler modes and shallow-angle equilibrium thresholds; not laboratory validation or snap dynamics."}),
        ),
        ("reference-results/published_comparison.json", json!({"checks":published})),
    ];
    assert!(files[0].1["published_checks"]
        .as_array()
        .unwrap()
        .iter()
        .all(|c| c["passed"] == true));
    for (name, value) in files {
        assert!(
            value["checks"]
                .as_array()
                .unwrap()
                .iter()
                .all(|c| c["passed"] == true),
            "{value}"
        );
        let target = root.join(name);
        if std::env::args().any(|a| a == "--write") {
            fs::write(
                target,
                format!("{}\n", serde_json::to_string_pretty(&value).unwrap()),
            )
            .unwrap();
        } else {
            let stored: Value = serde_json::from_str(&fs::read_to_string(target).unwrap()).unwrap();
            assert_eq!(value, stored, "stale evidence: {name}");
        }
        println!("{name}: {value}");
    }
}
