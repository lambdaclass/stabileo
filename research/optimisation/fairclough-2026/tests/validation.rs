use gridshell_fairclough_2026::{engine, square};
use serde_json::{json, Value};
use std::{fs, path::Path};

#[test]
fn five_node_reference_and_engine() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let reference: Value =
        serde_json::from_str(include_str!("../reference-results/five-node.json")).unwrap();
    let layout = square().unwrap();
    let input = engine::model(&layout);
    let engine_check = engine::check(input.clone()).unwrap();
    let mut checks = Vec::new();
    let mut check = |name: &str, observed: f64, tolerance: f64| {
        let passed = observed.is_finite() && observed <= tolerance;
        checks.push(json!({"name":name,"metric":"absolute error or residual","observed":observed,"tolerance":tolerance,"passed":passed}));
    };
    check(
        "reference volume relative error",
        (layout.volume / reference["volume"].as_f64().unwrap() - 1.).abs(),
        1e-6,
    );
    check(
        "Table 1 printed volume absolute error",
        (layout.volume - 13.8394).abs(),
        5e-5,
    );
    check("primal residual", layout.primal_residual, 1e-8);
    check("dual residual", layout.dual_residual, 1e-8);
    check(
        "apex elevation reference error",
        (layout.nodes[4][2] - reference["elevations"][4].as_f64().unwrap()).abs(),
        1e-5,
    );
    check(
        "active curved members",
        (layout.curves.len() as f64 - 4.).abs(),
        0.,
    );
    let mut force_error: f64 = 0.;
    let mut cone_violation: f64 = 0.;
    for (e, (&[i, j], &[s, qa, qb])) in layout.edges.iter().zip(&layout.forces).enumerate() {
        for k in 0..3 {
            force_error = force_error
                .max((layout.forces[e][k] - reference["forces"][e][k].as_f64().unwrap()).abs());
        }
        let l = (layout.nodes[j][0] - layout.nodes[i][0])
            .hypot(layout.nodes[j][1] - layout.nodes[i][1]);
        let (sn, cs) = (1.65 * l).sin_cos();
        cone_violation =
            cone_violation.max((sn * (qa - qb)).hypot(2. * s) - (sn * (qa + qb) + 2. * cs * s));
        cone_violation = cone_violation.max(-s);
    }
    check("force vector reference maximum error", force_error, 1e-4);
    check("independent SOC feasibility", cone_violation, 1e-8);
    let mut curve_error: f64 = 0.;
    for (c, curve) in layout.curves.iter().enumerate() {
        for (k, p) in curve.iter().enumerate() {
            for d in 0..3 {
                curve_error =
                    curve_error.max((p[d] - reference["curves"][c][d][k].as_f64().unwrap()).abs());
            }
        }
    }
    check(
        "reference centreline maximum coordinate error",
        curve_error,
        1e-4,
    );
    check(
        "engine vertical force balance",
        engine_check["relative_balance_error"].as_f64().unwrap(),
        1e-8,
    );
    check(
        "frame discretized volume relative error",
        ((-engine_check["vertical_load"].as_f64().unwrap() - 1.) / (1.65 * layout.volume) - 1.)
            .abs(),
        0.002,
    );
    assert!(engine_check["max_displacement"].as_f64().unwrap() > 0.);
    let evidence = json!({"scope":"Table 1: five nodes, rho_g L/sigma=1.65 only", "checks":checks});
    let published = json!({"checks":[{"name":"Table 1 five-node volume, first row","source":"https://eprints.whiterose.ac.uk/id/eprint/236639/ — accepted manuscript PDF page 29, printed page 28, Table 1; Section 4.3","metric":"absolute normalized volume error FL/sigma","reference":13.8394,"volume":layout.volume,"observed":(layout.volume-13.8394).abs(),"tolerance":0.00005,"passed":(layout.volume-13.8394).abs()<=0.00005}]});
    fs::create_dir_all(root.join("target")).unwrap();
    fs::write(
        root.join("target/VALIDATION.json"),
        serde_json::to_string_pretty(&evidence).unwrap() + "\n",
    )
    .unwrap();
    fs::write(
        root.join("target/PUBLISHED_COMPARISON.json"),
        serde_json::to_string_pretty(&published).unwrap() + "\n",
    )
    .unwrap();
    assert!(checks.iter().all(|c| c["passed"] == true), "{evidence}");
    let results = json!({"layout":layout,"engine":engine_check,"engine_input":input});
    fs::write(
        root.join("target/stabileo_results.json"),
        serde_json::to_string_pretty(&results).unwrap() + "\n",
    )
    .unwrap();
    if std::env::var_os("UPDATE_FAIRCLOUGH").is_some() {
        for (name, value) in [
            ("VALIDATION.json", evidence.clone()),
            ("PUBLISHED_COMPARISON.json", published.clone()),
            ("results/stabileo_results.json", results.clone()),
        ] {
            fs::write(
                root.join(name),
                serde_json::to_string_pretty(&value).unwrap() + "\n",
            )
            .unwrap();
        }
    }
    let recorded: Value =
        serde_json::from_str(&fs::read_to_string(root.join("VALIDATION.json")).unwrap()).unwrap();
    for (a, b) in checks.iter().zip(recorded["checks"].as_array().unwrap()) {
        assert_eq!(a["name"], b["name"]);
        assert_eq!(a["tolerance"], b["tolerance"]);
        assert_eq!(a["passed"], b["passed"]);
        assert!((a["observed"].as_f64().unwrap() - b["observed"].as_f64().unwrap()).abs() < 1e-8);
    }
    assert_eq!(checks.len(), recorded["checks"].as_array().unwrap().len());
    let stored: Value = serde_json::from_str(
        &fs::read_to_string(root.join("results/stabileo_results.json")).unwrap(),
    )
    .unwrap();
    assert!(
        (stored["layout"]["volume"].as_f64().unwrap()
            - results["layout"]["volume"].as_f64().unwrap())
        .abs()
            < 1e-8
    );
    fn close(a: &Value, b: &Value, path: &str) {
        match (a, b) {
            (Value::Number(x), Value::Number(y)) => assert!(
                (x.as_f64().unwrap() - y.as_f64().unwrap()).abs()
                    <= 1e-8 * x.as_f64().unwrap().abs().max(1.),
                "{path}: recorded {x}, computed {y}"
            ),
            (Value::Array(x), Value::Array(y)) => {
                assert_eq!(x.len(), y.len());
                for (i, (a, b)) in x.iter().zip(y).enumerate() {
                    close(a, b, &format!("{path}[{i}]"));
                }
            }
            (Value::Object(x), Value::Object(y)) => {
                assert_eq!(x.len(), y.len());
                for (k, v) in x {
                    close(v, &y[k], &format!("{path}.{k}"));
                }
            }
            _ => assert_eq!(a, b),
        }
    }
    close(&stored, &results, "results");
    let comparison: Value =
        serde_json::from_str(&fs::read_to_string(root.join("PUBLISHED_COMPARISON.json")).unwrap())
            .unwrap();
    close(&comparison, &published, "published");
}
