use dedaliano_engine::solver::arc_length::{solve_arc_length, ArcLengthInput};
use serde_json::{json, Value};

const CROWN_KEYS: [&str; 3] = ["uOverR", "vOverR", "rotation"];
const GCI_SAFETY_FACTOR: f64 = 1.25;

fn case() -> Value {
    serde_json::from_str(include_str!("dadeppo_arch.json")).unwrap()
}

fn shared_input() -> ArcLengthInput {
    serde_json::from_value(case()["input"].clone()).unwrap()
}

fn arch(elements: usize, axial_stiffness_factor: f64, arc_length_factor: f64) -> ArcLengthInput {
    let case = case();
    let radius = case["radius"].as_f64().unwrap();
    let half = (case["openingDegrees"].as_f64().unwrap() / 2.0).to_radians();
    let mut input = case["input"].clone();
    let mut nodes = serde_json::Map::new();
    let mut members = serde_json::Map::new();
    for i in 0..=elements {
        let angle = -half + 2.0 * half * i as f64 / elements as f64;
        nodes.insert(i.to_string(), json!({"id": i, "x": radius * angle.sin(), "z": radius * angle.cos()}));
        if i < elements {
            members.insert(i.to_string(), json!({"id": i, "type": "frame", "nodeI": i, "nodeJ": i + 1, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false}));
        }
    }
    let solver = &mut input["solver"];
    solver["nodes"] = Value::Object(nodes);
    solver["elements"] = Value::Object(members);
    solver["supports"] = json!({"0": {"id": 0, "nodeId": 0, "type": "fixed"}, elements.to_string(): {"id": elements, "nodeId": elements, "type": "pinned"}});
    solver["loads"] = json!([{"type": "nodal", "data": {"nodeId": elements / 2, "fx": 0, "fz": -1, "my": 0}}]);
    let area = solver["sections"]["1"]["a"].as_f64().unwrap();
    solver["sections"]["1"]["a"] = json!(area * axial_stiffness_factor);
    for key in ["initialDs", "maxDs"] {
        input[key] = json!(input[key].as_f64().unwrap() * arc_length_factor);
    }
    input["maxSteps"] = json!((input["maxSteps"].as_f64().unwrap() / arc_length_factor).ceil() as usize);
    serde_json::from_value(input).unwrap()
}

#[derive(Debug)]
struct LimitPoint {
    load: f64,
    peak_step: usize,
    offset: f64,
    crown: [f64; 3],
}

fn crown_state(input: &ArcLengthInput, steps: usize) -> [f64; 3] {
    let radius = case()["radius"].as_f64().unwrap();
    let crown_node = input.solver.nodes.len() / 2;
    let mut prefix = input.clone();
    prefix.max_steps = steps;
    let run = solve_arc_length(&prefix).unwrap();
    assert!(run.converged);
    assert_eq!(run.steps.len(), steps);
    let d = run.results.displacements.iter().find(|d| d.node_id == crown_node).unwrap();
    [d.ux / radius, -d.uz / radius, d.ry]
}

fn limit_point(input: &ArcLengthInput) -> LimitPoint {
    let run = solve_arc_length(input).unwrap();
    assert!(run.converged);
    let loads: Vec<f64> = run.steps.iter().map(|s| s.load_factor).collect();
    let k = (0..loads.len()).max_by(|&a, &b| loads[a].total_cmp(&loads[b])).unwrap();
    assert!(k > 0 && k + 1 < loads.len(), "the path must pass the limit point");
    let (before, peak, after) = (loads[k - 1], loads[k], loads[k + 1]);
    let offset = (before - after) / (2.0 * (before - 2.0 * peak + after));
    assert!(offset.abs() <= 0.5);
    let load = peak - (before - after) * offset / 4.0;
    let states = [k, k + 1, k + 2].map(|steps| crown_state(input, steps));
    let crown = [0, 1, 2].map(|i| {
        let (a, b, c) = (states[0][i], states[1][i], states[2][i]);
        b + offset * (c - a) / 2.0 + offset * offset * (c - 2.0 * b + a) / 2.0
    });
    LimitPoint { load, peak_step: k + 1, offset, crown }
}

fn rounding(value: f64) -> f64 {
    let decimals = format!("{value}").split('.').nth(1).map_or(0, str::len) as i32;
    0.5 * 10f64.powi(-decimals) / value.abs()
}

#[test]
fn limit_load() {
    let case = case();
    let input = shared_input();
    let result = solve_arc_length(&input).unwrap();
    let peak = result.steps.iter().map(|s| s.load_factor).fold(0.0_f64, f64::max);
    println!("peak={peak}, final={}, steps={}, converged={}", result.final_load_factor, result.steps.len(), result.converged);
    assert!((peak - 9.0112911888175).abs() < 1e-6, "limit-load regression: {peak}");
    assert!(result.converged);
    assert_eq!(result.steps.len(), input.max_steps);
    assert!((peak / case["reference"].as_f64().unwrap() - 1.0).abs() < case["relativeTolerance"].as_f64().unwrap());
    assert!(result.final_load_factor < peak * 0.95, "must pass the limit point");
    assert!((result.steps[299].load_factor - 8.418779219590325).abs() < 1e-6, "post-peak checkpoint: {}", result.steps[299].load_factor);
    assert!((result.final_load_factor - 4.824835941517055).abs() < 1e-6, "final-load regression: {}", result.final_load_factor);
    if let Ok(path) = std::env::var("DADEPPO_EXPORT") {
        let mut frames = Vec::new();
        for step in (20..=input.max_steps).step_by(20) {
            let mut prefix = input.clone();
            prefix.max_steps = step;
            let run = solve_arc_length(&prefix).unwrap();
            assert!(run.converged);
            assert_eq!(run.steps.len(), step);
            frames.push(json!({"step": step, "loadFactor": run.final_load_factor, "displacements": run.results.displacements}));
        }
        let limit = limit_point(&input);
        let crown: serde_json::Map<String, Value> = CROWN_KEYS.iter().zip(limit.crown).map(|(k, v)| (k.to_string(), json!(v))).collect();
        let limit = json!({"loadFactor": limit.load, "peakStep": limit.peak_step, "offset": limit.offset, "crown": crown});
        std::fs::write(path, serde_json::to_string(&json!({"frames": frames, "steps": result.steps, "limitPoint": limit})).unwrap() + "\n").unwrap();
    }
}

#[test]
fn crown_state_at_the_limit_point_matches_the_published_table() {
    let case = case();
    let limit = limit_point(&shared_input());
    println!("{limit:?}");
    assert_eq!(limit.peak_step, 267);
    for (i, key) in CROWN_KEYS.iter().enumerate() {
        let published = case["crownReference"][key].as_f64().unwrap();
        let tolerance = case["crownRelativeTolerance"][key].as_f64().unwrap();
        assert!(limit.crown[i] > 0.0, "{key} sign: {}", limit.crown[i]);
        assert!((limit.crown[i] / published - 1.0).abs() < tolerance, "{key}: {} vs {published}", limit.crown[i]);
    }
    assert!((limit.load / case["reference"].as_f64().unwrap() - 1.0).abs() < case["relativeTolerance"].as_f64().unwrap());
}

#[test]
fn generated_arch_reproduces_the_shared_case() {
    let shared = shared_input();
    let generated = arch(40, 1.0, 1.0);
    assert_eq!(shared.solver.nodes.len(), generated.solver.nodes.len());
    for (id, node) in &shared.solver.nodes {
        let other = &generated.solver.nodes[id];
        assert!((node.x - other.x).abs() < 1e-12 && (node.z - other.z).abs() < 1e-12, "node {id}");
    }
    let without_nodes = |input: &ArcLengthInput| {
        let mut value = serde_json::to_value(input).unwrap();
        value["solver"].as_object_mut().unwrap().remove("nodes");
        value
    };
    assert_eq!(without_nodes(&shared), without_nodes(&generated));
}

#[test]
fn mesh_step_and_axial_stiffness_study_bounds_the_tolerances() {
    let case = case();
    let coarse = limit_point(&arch(20, 1.0, 1.0));
    let medium = limit_point(&arch(40, 1.0, 1.0));
    let fine = limit_point(&arch(80, 1.0, 2.0));
    println!("20: {coarse:?}\n40: {medium:?}\n80: {fine:?}");
    let mut quantities = vec![("load".to_string(), case["reference"].as_f64().unwrap(), case["relativeTolerance"].as_f64().unwrap(), [coarse.load, medium.load, fine.load])];
    for (i, key) in CROWN_KEYS.iter().enumerate() {
        quantities.push((key.to_string(), case["crownReference"][key].as_f64().unwrap(), case["crownRelativeTolerance"][key].as_f64().unwrap(), [coarse.crown[i], medium.crown[i], fine.crown[i]]));
    }
    for (name, published, tolerance, [q20, q40, q80]) in quantities {
        let order = ((q20 - q40) / (q40 - q80)).log2();
        assert!((1.5..2.5).contains(&order), "{name}: observed order {order}");
        let extrapolated = q80 + (q80 - q40) / (2f64.powf(order) - 1.0);
        let gci_medium = GCI_SAFETY_FACTOR * ((q40 - extrapolated) / extrapolated).abs();
        let gci_fine = GCI_SAFETY_FACTOR * ((q80 - extrapolated) / extrapolated).abs();
        let budget = gci_medium + rounding(published);
        println!("{name}: order={order:.3} extrapolated={extrapolated:.6} published={published} gci40={gci_medium:.5} gci80={gci_fine:.5} budget={budget:.5} tolerance={tolerance} converged-vs-published={:.5}", extrapolated / published - 1.0);
        assert!((extrapolated / published - 1.0).abs() < gci_fine + rounding(published), "{name}: converged {extrapolated} vs published {published}");
        assert!(tolerance >= budget, "{name}: tolerance {tolerance} below its budget {budget}");
        assert!(tolerance <= 1.25 * budget, "{name}: tolerance {tolerance} looser than its budget {budget} warrants");
    }
    if let Ok(path) = std::env::var("DADEPPO_STUDY_EXPORT") {
        let row = |elements: usize, limit: &LimitPoint| json!({"elements": elements, "loadFactor": limit.load, "uOverR": limit.crown[0], "vOverR": limit.crown[1], "rotation": limit.crown[2]});
        std::fs::write(path, serde_json::to_string_pretty(&json!({"gciSafetyFactor": GCI_SAFETY_FACTOR, "meshes": [row(20, &coarse), row(40, &medium), row(80, &fine)]})).unwrap() + "\n").unwrap();
    }
    let halved = limit_point(&arch(40, 1.0, 0.5));
    assert!((halved.load / medium.load - 1.0).abs() < 1e-6, "step size: {} vs {}", halved.load, medium.load);
    let stiffer = limit_point(&arch(40, 10.0, 1.0));
    assert!((stiffer.load / medium.load - 1.0).abs() < 1e-4, "axial stiffness: {} vs {}", stiffer.load, medium.load);
}
