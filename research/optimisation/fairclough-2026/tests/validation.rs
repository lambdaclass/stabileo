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
        let (metric, rationale) = match name {
            "reference volume relative error" => ("relative volume error", "1e-6 cross-solver objective budget; normalized by author volume"),
            "engine vertical force balance" => ("relative reaction/load imbalance", "1e-8 linear-solve roundoff budget; bookkeeping only, not catenary physics"),
            "frame discretized volume relative error" => ("relative volume error", "0.2% chord quadrature budget; verified by 32/64/128 segment refinement"),
            "Table 1 printed volume absolute error" => ("absolute normalized volume error FL/sigma", "Half a unit of the last printed decimal"),
            "primal residual" | "dual residual" | "independent SOC feasibility" => ("absolute residual", "1e-8 allows residual scaling and roundoff above the 1e-10 solver settings"),
            "apex elevation reference error" => ("absolute elevation error L", "1e-5 normalized height budget for cross-solver dual recovery"),
            "active curved members" => ("absolute member count difference", "Exactly four active members; no count discrepancy allowed"),
            "force vector reference maximum error" => ("maximum absolute force error F", "1e-4 cross-solver recovery budget for all ten force triples"),
            "reference centreline maximum coordinate error" => ("maximum absolute coordinate error L", "1e-4 cross-solver recovery budget at all 132 samples"),
            "reference section area maximum error" => ("maximum absolute area error F/sigma", "1e-4 cross-solver force/area recovery budget; observed about 1.9e-5 against author pi*r^2"),
            "equal-stress section area formula error" => ("maximum absolute area error F/sigma", "1e-12 roundoff budget for independent distance-based evaluation of s/cos(phi)"),
            _ => panic!("Missing metric and rationale for {name}"),
        };
        let passed = observed.is_finite() && observed <= tolerance;
        checks.push(json!({"name":name,"metric":metric,"rationale":rationale,"observed":observed,"tolerance":tolerance,"passed":passed}));
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
    let mut centre = [0.0_f64; 3];
    for (&[i, j], &[thrust, _, qb]) in layout.edges.iter().zip(&layout.forces) {
        if j == 4 {
            let dx = layout.nodes[j][0] - layout.nodes[i][0];
            let dy = layout.nodes[j][1] - layout.nodes[i][1];
            let length = dx.hypot(dy);
            centre[0] += thrust * dx / length;
            centre[1] += thrust * dy / length;
            centre[2] += qb;
        }
    }
    assert!(centre[0].abs() < 1e-8 && centre[1].abs() < 1e-8);
    assert!((centre[2] + 1.).abs() < 1e-8);
    assert!(engine_check["vertical_load"].as_f64().unwrap() < -1.);
    let mut support_vertical = 0.;
    for (&[i,j], &[_,qa,qb]) in layout.edges.iter().zip(&layout.forces) {
        if i < 4 { support_vertical += qa; }
        if j < 4 { support_vertical += qb; }
    }
    assert!(support_vertical > 1.);
    assert!((support_vertical - (1. + 1.65*layout.volume)).abs() < 1e-8);
    let mut area_error: f64 = 0.;
    let mut formula_error: f64 = 0.;
    let active: Vec<_> = layout.edges.iter().zip(&layout.forces).filter(|(_, f)| f[0] > 1e-5).collect();
    let mut curve_error: f64 = 0.;
    for (c, curve) in layout.curves.iter().enumerate() {
        let (&[i,j], &[thrust, qa, _]) = active[c];
        let length = (layout.nodes[j][0]-layout.nodes[i][0]).hypot(layout.nodes[j][1]-layout.nodes[i][1]);
        for (k, p) in curve.iter().enumerate() {
            let radius = reference["curves"][c][3][k].as_f64().unwrap();
            area_error = area_error.max((p[3] - std::f64::consts::PI * radius * radius).abs());
            let x = (p[0]-layout.nodes[i][0]).hypot(p[1]-layout.nodes[i][1]);
            assert!(x <= length + 1e-12 && p[3] > 0.);
            formula_error = formula_error.max((p[3] - thrust / ((qa/thrust).atan()-1.65*x).cos()).abs());
            for d in 0..3 {
                curve_error =
                    curve_error.max((p[d] - reference["curves"][c][d][k].as_f64().unwrap()).abs());
            }
        }
    }
    check("reference section area maximum error", area_error, 1e-4);
    check("equal-stress section area formula error", formula_error, 1e-12);
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
    fs::create_dir_all(root.join("target/reference-results")).unwrap();
    fs::write(
        root.join("target/VALIDATION.json"),
        serde_json::to_string_pretty(&evidence).unwrap() + "\n",
    )
    .unwrap();
    fs::write(
        root.join("target/reference-results/published_comparison.json"),
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
            ("reference-results/published_comparison.json", published.clone()),
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
        assert_eq!(a["metric"], b["metric"]);
        assert_eq!(a["rationale"], b["rationale"]);
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
    let comparison: Value = serde_json::from_str(
        &fs::read_to_string(root.join("reference-results/published_comparison.json")).unwrap(),
    )
    .unwrap();
    close(&comparison, &published, "published");
}

#[test]
fn chord_volume_refines_quadratically() {
    let layout = square().unwrap();
    let mut errors = Vec::new();
    for n in [32, 64, 128] {
        let mut volume = 0.;
        for (&[i,j], &[s,qa,_]) in layout.edges.iter().zip(&layout.forces) {
            if s <= 1e-5 { continue; }
            let length = (layout.nodes[j][0]-layout.nodes[i][0]).hypot(layout.nodes[j][1]-layout.nodes[i][1]);
            let theta = (qa/s).atan();
            let point = |k: usize| {
                let x = length * k as f64 / n as f64;
                let phi = theta - 1.65*x;
                (x, (phi.cos()/theta.cos()).ln()/1.65, s/phi.cos())
            };
            for k in 0..n {
                let (x,z,a) = point(k);
                let (xx,zz,aa) = point(k+1);
                volume += (xx-x).hypot(zz-z)*(a+aa)/2.;
            }
        }
        errors.push((volume/layout.volume-1.).abs());
    }
    assert!(errors[0] < 0.002);
    assert!(errors[1] < 0.00025);
    assert!(errors[2] < 0.000062);
    for pair in errors.windows(2) { assert!(pair[0]/pair[1] > 3.9 && pair[0]/pair[1] < 4.1); }
}
