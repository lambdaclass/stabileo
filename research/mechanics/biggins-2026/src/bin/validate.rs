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
    let observed = result.threshold / result.compression.sqrt();
    let mut published = check(
        "centered 70% alpha/sqrt(epsilon): absolute error",
        (observed - 21.52).abs(),
        0.02,
    );
    published["source"]=json!("Zmyślony et al., doi:10.1103/56f8-8gsx; arXiv:2601.06598v2 p.3 following Eq.(2), Eq.(3) p.4, supplementary Table S1 p.8 (PDF p.17)");
    published["reference"] = json!(21.52);
    published["computed"] = json!(observed);
    let files = [
        (
            "VALIDATION.json",
            json!({"checks":checks,"published_checks":[published.clone()],"scope":"Production Euler modes and shallow-angle equilibrium thresholds; not laboratory validation or snap dynamics."}),
        ),
        ("PUBLISHED_COMPARISON.json", json!({"checks":[published]})),
    ];
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
            assert_eq!(
                value["checks"].as_array().unwrap().len(),
                stored["checks"].as_array().unwrap().len()
            );
            for (a, b) in value["checks"]
                .as_array()
                .unwrap()
                .iter()
                .zip(stored["checks"].as_array().unwrap())
            {
                assert_eq!(a["metric"], b["metric"]);
                assert!(
                    (a["observed"].as_f64().unwrap() - b["observed"].as_f64().unwrap()).abs()
                        < 1e-7,
                    "stale evidence"
                );
            }
        }
        println!("{name}: {value}");
    }
}
