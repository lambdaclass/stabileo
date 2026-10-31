use dedaliano_engine::{solver::linear, types::SolverInput3D};
use serde_json::{json, Map, Value};

fn param(p: &Value, key: &str) -> f64 {
    p[key].as_f64().unwrap()
}

fn rigidity(p: &Value) -> f64 {
    let (e, nu, t) = (param(p, "e") * 1000.0, param(p, "nu"), param(p, "thickness"));
    e * t.powi(3) / (12.0 * (1.0 - nu * nu))
}

fn series(p: &Value, terms: usize, power: i32) -> f64 {
    let (a, b) = (param(p, "a"), param(p, "b"));
    let mut sum = 0.0;
    for i in 0..terms {
        for j in 0..terms {
            let (m, n) = ((2 * i + 1) as f64, (2 * j + 1) as f64);
            let sign = if (i + j) % 2 == 0 { 1.0 } else { -1.0 };
            sum += sign / (m * n * ((m / a).powi(2) + (n / b).powi(2)).powi(power));
        }
    }
    sum
}

fn kirchhoff_center_mm(p: &Value, terms: usize) -> f64 {
    1000.0 * 16.0 * param(p, "pressure") * series(p, terms, 2) / (std::f64::consts::PI.powi(6) * rigidity(p))
}

fn mindlin_center_mm(p: &Value, terms: usize) -> f64 {
    let shear_stiffness = param(p, "shear_correction") * param(p, "e") * 1000.0 / (2.0 * (1.0 + param(p, "nu"))) * param(p, "thickness");
    let shear = 1000.0 * 16.0 * param(p, "pressure") * series(p, terms, 1) / (std::f64::consts::PI.powi(4) * shear_stiffness);
    kirchhoff_center_mm(p, terms) + shear
}

fn build(p: &Value, family: &str, n: usize, hard: bool) -> (Value, usize) {
    let (a, b, q, t) = (param(p, "a"), param(p, "b"), param(p, "pressure"), param(p, "thickness"));
    let id = |i: usize, j: usize| i * (n + 1) + j + 1;
    let (mut nodes, mut supports, mut plates, mut quads) = (Map::new(), Map::new(), Map::new(), Map::new());
    let mut force = vec![0.0; (n + 1) * (n + 1) + 1];
    for i in 0..=n {
        for j in 0..=n {
            let k = id(i, j);
            nodes.insert(k.to_string(), json!({"id": k, "x": a * i as f64 / n as f64, "y": b * j as f64 / n as f64, "z": 0}));
            let (x_edge, y_edge) = (i == 0 || i == n, j == 0 || j == n);
            if x_edge || y_edge {
                supports.insert(k.to_string(), json!({"nodeId": k, "rx": k == 1, "ry": k == 1 || (i == n && j == 0), "rz": true,
                    "rrx": hard && x_edge, "rry": hard && y_edge, "rrz": false}));
            }
        }
    }
    let area = a * b / (n * n) as f64;
    for i in 0..n {
        for j in 0..n {
            let corners = [id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)];
            if family == "MITC4" {
                let k = quads.len() + 1;
                quads.insert(k.to_string(), json!({"id": k, "nodes": corners, "materialId": 1, "thickness": t}));
                corners.iter().for_each(|&c| force[c] += q * area / 4.0);
            } else {
                for tri in [[corners[0], corners[1], corners[2]], [corners[0], corners[2], corners[3]]] {
                    let k = plates.len() + 1;
                    plates.insert(k.to_string(), json!({"id": k, "nodes": tri, "materialId": 1, "thickness": t}));
                    tri.iter().for_each(|&c| force[c] += q * area / 2.0 / 3.0);
                }
            }
        }
    }
    let loads: Vec<Value> = (1..force.len())
        .map(|k| json!({"type": "nodal", "data": {"nodeId": k, "fx": 0, "fy": 0, "fz": -force[k], "mx": 0, "my": 0, "mz": 0}}))
        .collect();
    let input = json!({"nodes": nodes, "materials": {"1": {"id": 1, "e": param(p, "e"), "nu": param(p, "nu")}}, "sections": {}, "elements": {},
        "supports": supports, "loads": loads, "plates": plates, "quads": quads});
    (input, id(n / 2, n / 2))
}

fn solve_center(input: &Value, center: usize) -> (f64, Vec<f64>, f64) {
    let input: SolverInput3D = serde_json::from_value(input.clone()).unwrap();
    let result = linear::solve_3d(&input).unwrap();
    let uz = |id: usize| -1000.0 * result.displacements.iter().find(|d| d.node_id == id).unwrap().uz;
    let reaction = result.reactions.iter().map(|r| r.fz).sum();
    (uz(center), (1..=input.nodes.len()).map(uz).collect(), reaction)
}

fn relative(w: f64, reference: f64) -> f64 {
    w / reference - 1.0
}

fn richardson(coarse: f64, fine: f64) -> f64 {
    fine + (fine - coarse) / 3.0
}

fn increment_ratio(w: &[f64]) -> f64 {
    (w[1] - w[0]) / (w[2] - w[1])
}

#[test]
fn navier_plate_shared_cases() {
    let data: Value = serde_json::from_str(include_str!("navier_plate.json")).unwrap();
    let p = &data["parameters"];
    let reference = param(p, "reference_mm");
    let mindlin = param(p, "mindlin_reference_mm");
    let terms = p["terms"].as_u64().unwrap() as usize;

    assert!((reference - param(p, "published_mm")).abs() < 5e-6);
    assert!((kirchhoff_center_mm(p, terms) - reference).abs() < 1e-12);
    assert!((kirchhoff_center_mm(p, 4 * terms) - reference).abs() < 1e-9, "Kirchhoff series truncation");
    let mindlin_terms = p["mindlin_terms"].as_u64().unwrap() as usize;
    assert!((mindlin_center_mm(p, mindlin_terms) - mindlin).abs() < 1e-11);
    assert!((mindlin_center_mm(p, 2 * mindlin_terms) - mindlin).abs() < 1e-9, "Mindlin series truncation");
    assert_eq!(param(p, "shear_correction"), 5.0 / 6.0);

    let (a, b) = (param(p, "a"), param(p, "b"));
    let mut rows = Vec::new();
    let mut hard_rows = Vec::new();
    let mut soft = std::collections::HashMap::<&str, Vec<f64>>::new();
    for case in data["cases"].as_array().unwrap() {
        let family = case["family"].as_str().unwrap();
        let n = case["n"].as_u64().unwrap() as usize;
        let center = case["center"].as_u64().unwrap() as usize;
        let (built, built_center) = build(p, family, n, false);
        assert_eq!(built, case["input"], "{family} {n}: fixture differs from the plate builder");
        assert_eq!(built_center, center);
        let input: SolverInput3D = serde_json::from_value(case["input"].clone()).unwrap();
        let node = &input.nodes[&center.to_string()];
        assert!((node.x - a / 2.0).abs() < 1e-12 && (node.y - b / 2.0).abs() < 1e-12);

        let (w, values, reaction) = solve_center(&case["input"], center);
        assert!(w.is_finite() && w > 0.0);
        assert!((reaction - 150.0).abs() < 1e-6);
        assert!(relative(w, reference).abs() < param(p, "tolerance_relative"));
        println!("{family} {n}: reference={reference:.9} mm, Stabileo={w:.9} mm, error={:.6}%", 100.0 * relative(w, reference));
        soft.entry(family).or_default().push(w);
        rows.push(json!({"family": family, "n": n, "center_mm": w, "values": values}));
        if family == "MITC4" {
            let (hard, _) = build(p, family, n, true);
            let (wh, values, reaction) = solve_center(&hard, center);
            assert!((reaction - 150.0).abs() < 1e-6);
            println!("MITC4 hard {n}: reference={mindlin:.9} mm, Stabileo={wh:.9} mm, error={:.6}%", 100.0 * relative(wh, mindlin));
            hard_rows.push(json!({"family": family, "n": n, "center_mm": wh, "values": values}));
        }
    }

    let dkt = &soft["DKT"];
    assert!(dkt.windows(2).all(|w| relative(w[1], reference).abs() < relative(w[0], reference).abs()));
    assert!(relative(dkt[2], reference).abs() < 0.0025, "DKT 16x16 Kirchhoff error");
    let ratio = increment_ratio(dkt);
    assert!((3.5..4.5).contains(&ratio), "DKT increment ratio {ratio}: not second order");
    assert!(relative(richardson(dkt[1], dkt[2]), reference).abs() < 1e-4, "DKT does not extrapolate to the Kirchhoff series");

    let hard: Vec<f64> = hard_rows.iter().map(|r| r["center_mm"].as_f64().unwrap()).collect();
    assert!(relative(hard[2], mindlin).abs() < 0.0016, "MITC4 hard-support 16x16 Mindlin error");
    assert!(hard.windows(2).all(|w| relative(w[1], mindlin).abs() < relative(w[0], mindlin).abs()));

    let finer = |family: &str, hard: bool, n: usize| {
        let (input, center) = build(p, family, n, hard);
        solve_center(&input, center).0
    };
    let hard_32 = finer("MITC4", true, 32);
    let ratio = increment_ratio(&[hard[1], hard[2], hard_32]);
    assert!((3.5..4.5).contains(&ratio), "MITC4 hard-support increment ratio {ratio}: not second order");
    assert!(relative(richardson(hard[2], hard_32), mindlin).abs() < 1e-4, "MITC4 hard support does not extrapolate to the Mindlin series");
    let dkt_32 = finer("DKT", false, 32);
    assert!(relative(richardson(dkt[2], dkt_32), reference).abs() < 1e-4);

    let mitc4 = &soft["MITC4"];
    let (soft_32, soft_64) = (finer("MITC4", false, 32), finer("MITC4", false, 64));
    println!("MITC4 soft 32: {soft_32:.9} mm, 64: {soft_64:.9} mm");
    assert!(mitc4[1] < mitc4[2] && mitc4[2] < soft_32 && soft_32 < soft_64 && soft_64 > mindlin * 1.015, "soft-support MITC4 no longer drifts above both series");
    assert!(increment_ratio(&[mitc4[1], mitc4[2], soft_32]) < 1.5, "soft-support MITC4 now converges at a higher order: revisit the page");

    if let Ok(path) = std::env::var("NAVIER_RESULTS") {
        std::fs::write(path, serde_json::to_string(&json!({"parameters": p, "rows": rows, "hard_rows": hard_rows})).unwrap() + "\n").unwrap();
    }
}
