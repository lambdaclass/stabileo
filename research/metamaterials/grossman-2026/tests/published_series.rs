use serde_json::Value;
use std::path::Path;

fn compare(a: &Value, b: &Value) {
    match (a, b) {
        (Value::Number(a), Value::Number(b)) => {
            let (a, b) = (a.as_f64().unwrap(), b.as_f64().unwrap());
            assert!(a.is_finite() && b.is_finite());
            assert!((a-b).abs() <= 1e-12 + 1e-8*a.abs().max(b.abs()), "{a} != {b}");
        }
        (Value::Array(a), Value::Array(b)) => {
            assert_eq!(a.len(), b.len());
            for (a,b) in a.iter().zip(b) { compare(a,b); }
        }
        (Value::Object(a), Value::Object(b)) => {
            assert_eq!(a.len(), b.len());
            for (key,a) in a { compare(a, &b[key]); }
        }
        _ => assert_eq!(a,b),
    }
}

#[test]
fn all_published_numbers_and_replay_frames_match_native_solver() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    for (binary, file) in [(env!("CARGO_BIN_EXE_reproduce"), "results/stabileo_results.json"), (env!("CARGO_BIN_EXE_replay"), "reference-results/replay.json")] {
        let output = root.join("target").join(file);
        std::fs::create_dir_all(output.parent().unwrap()).unwrap();
        assert!(std::process::Command::new(binary).arg(&output).status().unwrap().success());
        let read = |p| serde_json::from_slice::<Value>(&std::fs::read(p).unwrap()).unwrap();
        compare(&read(root.join(file)), &read(output));
    }
}

#[test]
fn direct_strip_fig5_comparisons_record_disagreement() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let data: Value = serde_json::from_slice(&std::fs::read(root.join("results/stabileo_results.json")).unwrap()).unwrap();
    let csv = std::fs::read_to_string(root.join("reference-results/fig5_simulation_digitized.csv")).unwrap();
    let mut comparisons = Vec::new();
    for line in csv.lines().skip(1) {
        let f: Vec<_> = line.split(',').collect();
        if f[4] != "up" { continue; }
        let eta: f64 = f[0].parse().unwrap();
        let row = data["foam"]["strip_13x52"].as_array().unwrap().iter().find(|r| (r["eta"].as_f64().unwrap()-eta).abs()<1e-10).unwrap();
        let mean = row["nu"]["mean"].as_f64().unwrap();
        let lo: f64 = f[2].parse().unwrap();
        let hi: f64 = f[3].parse().unwrap();
        comparisons.push(serde_json::json!({"eta":eta,"mean":mean,"lo":lo,"hi":hi,"digitisation":0.003,"passed":mean>=lo-0.003 && mean<=hi+0.003}));
    }
    let actual = serde_json::json!(comparisons);
    std::fs::create_dir_all(root.join("target/reference-results")).unwrap();
    std::fs::write(root.join("target/reference-results/published_comparison.json"),serde_json::to_string_pretty(&actual).unwrap()).unwrap();
    let recorded: Value = serde_json::from_slice(&std::fs::read(root.join("reference-results/published_comparison.json")).unwrap()).unwrap();
    compare(&recorded,&actual);
    assert_eq!(actual.as_array().unwrap().iter().filter(|r|r["passed"]==false).map(|r|r["eta"].as_f64().unwrap()).collect::<Vec<_>>(), vec![0.0,0.05,0.1,0.2]);
}

#[test]
fn dilution_series_brackets_sample_rigidity_onset() {
    let data: Value = serde_json::from_str(include_str!("../results/stabileo_results.json")).unwrap();
    let rows = data["dilution"].as_array().unwrap();
    let row = |keep:f64| rows.iter().find(|r| (r["keep"].as_f64().unwrap()-keep).abs()<1e-10).unwrap();
    assert!(row(0.61)["shear_max"].as_f64().unwrap().abs()<1e-6);
    assert!(row(0.64)["shear_min"].as_f64().unwrap().abs()<1e-6);
    assert!(row(0.64)["shear_max"].as_f64().unwrap()>0.0);
    assert!(row(0.67)["shear_min"].as_f64().unwrap()>0.0);
}

#[test]
fn one_percent_linear_strip_is_compared_with_nonlinear_energy_minimisation() {
    use springs_grossman_2026::{experiment::{run_strip,StripSpec},solve};
    let mut comparisons = Vec::new();
    for eta in [0.0,0.3] {
        let spec: StripSpec = serde_json::from_value(serde_json::json!({"network":{"lattice":{"kind":"triangular","phi":1,"psi":1},"eta":eta,"seed":11},"width":13,"height":52,"strain":0.01})).unwrap();
        let linear = run_strip(&spec).unwrap();
        let net = spec.network.strip(13.0,52.0,0.0).unwrap();
        let initial:Vec<_> = linear.nodes.iter().zip(&linear.displacement).map(|(p,u)|[p[0]+u[0],p[1]+u[1]]).collect();
        let relaxed = solve::relax(&net,&initial,&linear.held,1e-11,200).unwrap();
        let [a,b]=linear.gauge;
        let width=linear.nodes[b][0]-linear.nodes[a][0];
        let nonlinear=-(relaxed.positions[b][0]-relaxed.positions[a][0]-width)/width/0.01;
        assert!(nonlinear.is_finite());
        comparisons.push(serde_json::json!({"eta":eta,"strain":0.01,"seed":11,"linear":linear.poisson,"nonlinear":nonlinear,"absolute_difference":(nonlinear-linear.poisson).abs()}));
    }
    let root=Path::new(env!("CARGO_MANIFEST_DIR"));
    let actual=serde_json::json!(comparisons);
    std::fs::write(root.join("target/NONLINEAR_COMPARISON.json"),serde_json::to_string_pretty(&actual).unwrap()).unwrap();
    let recorded:Value=serde_json::from_slice(&std::fs::read(root.join("NONLINEAR_COMPARISON.json")).unwrap()).unwrap();
    compare(&recorded,&actual);
}
