use dedaliano_engine::solver::arc_length::{solve_arc_length, ArcLengthInput, EquilibriumStep};
use serde_json::{json, Value};

fn benchmark() -> Value {
    serde_json::from_str(include_str!("benchmarks/lee_frame.json")).unwrap()
}

fn first_peak(steps: &[EquilibriumStep]) -> Option<EquilibriumStep> {
    steps.windows(3).find(|w| w[1].load_factor > w[0].load_factor && w[1].load_factor > w[2].load_factor).map(|w| w[1].clone())
}

fn refined(data: &Value, split: usize, step_scale: f64, max_steps: usize) -> ArcLengthInput {
    let mut input = data["input"].clone();
    let solver = &input["solver"];
    let old: Vec<(f64, f64)> = (1..=21).map(|id| {
        let n = &solver["nodes"][id.to_string()];
        (n["x"].as_f64().unwrap(), n["z"].as_f64().unwrap())
    }).collect();
    let mut nodes = serde_json::Map::new();
    let mut id = 0;
    for (i, w) in old.windows(2).enumerate() {
        for j in 0..split {
            id += 1;
            let t = j as f64 / split as f64;
            let (x, z) = if j == 0 { w[0] } else { (w[0].0 + t * (w[1].0 - w[0].0), w[0].1 + t * (w[1].1 - w[0].1)) };
            nodes.insert(id.to_string(), json!({"id": id, "x": x, "z": z}));
        }
        if i == old.len() - 2 {
            id += 1;
            nodes.insert(id.to_string(), json!({"id": id, "x": w[1].0, "z": w[1].1}));
        }
    }
    let template = solver["elements"]["1"].clone();
    let elements: serde_json::Map<String, Value> = (1..id).map(|e| {
        let mut el = template.clone();
        el["id"] = json!(e);
        el["nodeI"] = json!(e);
        el["nodeJ"] = json!(e + 1);
        (e.to_string(), el)
    }).collect();
    let mut supports = solver["supports"].clone();
    for support in supports.as_object_mut().unwrap().values_mut() {
        let old_node = support["nodeId"].as_u64().unwrap() as usize;
        support["nodeId"] = json!((old_node - 1) * split + 1);
    }
    input["solver"]["nodes"] = Value::Object(nodes);
    input["solver"]["elements"] = Value::Object(elements);
    input["solver"]["supports"] = supports;
    input["solver"]["loads"][0]["data"]["nodeId"] = json!(12 * split + 1);
    let mut input: ArcLengthInput = serde_json::from_value(input).unwrap();
    input.initial_ds *= step_scale;
    input.max_ds *= step_scale;
    input.max_steps = max_steps;
    input
}

#[test]
fn lee_frame_limit_load() {
    let data = benchmark();
    let mut input: ArcLengthInput = serde_json::from_value(data["input"].clone()).unwrap();
    let result = solve_arc_length(&input).unwrap();
    assert!(result.converged);
    assert_eq!(result.steps.len(), input.max_steps);
    assert!(result.steps.iter().all(|s| s.converged && s.load_factor.is_finite()));
    let peak = first_peak(&result.steps).unwrap();
    let expected = data["regression"]["firstLimitLoad"].as_f64().unwrap();
    let tolerance = data["regression"]["absoluteTolerance"].as_f64().unwrap();
    assert!((peak.load_factor - expected).abs() < tolerance);
    assert_eq!(peak.step as u64, data["regression"]["firstPeakStep"].as_u64().unwrap());
    assert!(result.final_load_factor < peak.load_factor * 0.5);
    for id in [1, 21] {
        let d = result.results.displacements.iter().find(|d| d.node_id == id).unwrap();
        assert_eq!(d.ux, 0.0);
        assert_eq!(d.uz, 0.0);
    }
    println!("First sampled peak: {} kN at step {}", peak.load_factor, peak.step);
    if let Ok(path) = std::env::var("LEE_REPLAY_OUTPUT") {
        let count = input.max_steps;
        let mut frames = Vec::new();
        for step in 1..=count {
            input.max_steps = step;
            let r = solve_arc_length(&input).unwrap();
            assert!(r.converged);
            frames.push(serde_json::json!({"step": step, "load": r.final_load_factor, "displacement": r.results.displacements}));
        }
        std::fs::write(path, serde_json::to_string(&serde_json::json!({"frames": frames})).unwrap() + "\n").unwrap();
    }
}

#[test]
fn lee_frame_refinement_of_one_is_the_shared_case() {
    let data = benchmark();
    let shared: ArcLengthInput = serde_json::from_value(data["input"].clone()).unwrap();
    let same = refined(&data, 1, 1.0, shared.max_steps);
    assert_eq!(serde_json::to_value(&same).unwrap(), serde_json::to_value(&shared).unwrap());
}

#[test]
fn lee_frame_first_peak_converges_in_mesh_and_step() {
    let data = benchmark();
    let check = &data["convergence"];
    let tolerance = check["absoluteTolerance"].as_f64().unwrap();
    let mut peaks: Vec<(usize, f64)> = Vec::new();
    for case in check["cases"].as_array().unwrap() {
        let split = case["split"].as_u64().unwrap() as usize;
        let scale = case["stepScale"].as_f64().unwrap();
        let input = refined(&data, split, scale, case["maxSteps"].as_u64().unwrap() as usize);
        let result = solve_arc_length(&input).unwrap();
        assert!(result.steps.iter().all(|s| s.converged && s.load_factor.is_finite()));
        let peak = first_peak(&result.steps).expect("first peak reached");
        println!("{} elements, step scale {}: first sampled peak {} kN at step {}", 20 * split, scale, peak.load_factor, peak.step);
        assert!((peak.load_factor - case["firstPeak"].as_f64().unwrap()).abs() < tolerance);
        peaks.push((split, peak.load_factor));
    }
    let step_bound = check["stepEffectBound"].as_f64().unwrap();
    for split in [1, 2, 4] {
        let same: Vec<f64> = peaks.iter().filter(|p| p.0 == split).map(|p| p.1).collect();
        assert!(same.len() >= 2);
        let spread = same.iter().cloned().fold(f64::MIN, f64::max) - same.iter().cloned().fold(f64::MAX, f64::min);
        assert!(spread < step_bound, "{} elements: step-size spread {spread}", 20 * split);
    }
    let finest_step = |split: usize| peaks.iter().filter(|p| p.0 == split).last().unwrap().1;
    let (p20, p40, p80) = (finest_step(1), finest_step(2), finest_step(4));
    assert!(p20 > p40 && p40 > p80);
    let ratio = (p20 - p40) / (p40 - p80);
    println!("mesh change ratio {ratio}");
    assert!((3.0..5.0).contains(&ratio), "mesh change ratio {ratio}");
}
