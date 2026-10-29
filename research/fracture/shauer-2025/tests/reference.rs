//! Validation against the outputs of the unmodified reference code (reference-results/). Every
//! comparison is a named check with a stated tolerance; the set of checks is written to
//! target/VALIDATION.json and must equal the committed VALIDATION.json.

use std::collections::HashMap;
use std::path::PathBuf;

use phasefield_shauer_2025::examples::{bar_reference, three_point_bending_reference, NotchedPlate};
use phasefield_shauer_2025::mesh::Mesh;
use phasefield_shauer_2025::solver::{Solver, StepResult};
use serde::{Deserialize, Serialize};

fn dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn read_csv(name: &str) -> Vec<HashMap<String, String>> {
    let text = std::fs::read_to_string(dir().join("reference-results").join(name)).unwrap();
    let mut lines = text.lines();
    let header: Vec<String> = lines.next().unwrap().split(',').map(str::to_string).collect();
    lines.map(|l| {
        let values: Vec<_> = l.split(',').map(str::to_string).collect();
        assert_eq!(header.len(), values.len(), "CSV row length mismatch");
        header.iter().cloned().zip(values).collect()
    }).collect()
}

fn column(name: &str, col: usize) -> Vec<f64> {
    let text = std::fs::read_to_string(dir().join("reference-results").join(name)).unwrap();
    text.lines().skip(1).map(|l| {
        let value: f64 = l.split(',').nth(col).unwrap().parse().unwrap();
        assert!(value.is_finite());
        value
    }).collect()
}

fn f(row: &HashMap<String, String>, k: &str) -> f64 {
    let value: f64 = row[k].parse().unwrap();
    assert!(value.is_finite());
    value
}

fn fnv1a64(bytes: impl Iterator<Item = u8>) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in bytes {
        h = (h ^ b as u64).wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

fn mesh_fingerprint(m: &Mesh) -> (String, String) {
    let nodes = fnv1a64(m.nodes.iter().flat_map(|p| p.iter().flat_map(|v| v.to_le_bytes())));
    let elems = fnv1a64(m.elements.iter().flat_map(|e| e.iter().flat_map(|&v| (v as i64).to_le_bytes())));
    (nodes, elems)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct Check {
    name: String,
    metric: String,
    tolerance: f64,
    observed: f64,
    passed: bool,
}

#[derive(Default)]
struct Checks(Vec<Check>);

impl Checks {
    fn at_most(&mut self, name: &str, metric: &str, observed: f64, tolerance: f64) {
        self.0.push(Check { name: name.into(), metric: metric.into(), tolerance, observed, passed: observed <= tolerance });
    }
    fn equal(&mut self, name: &str, ok: bool) {
        self.0.push(Check { name: name.into(), metric: "exact".into(), tolerance: 0.0, observed: if ok { 0.0 } else { 1.0 }, passed: ok });
    }
}

fn rel(a: f64, b: f64) -> f64 {
    assert!(a.is_finite() && b.is_finite());
    (a - b).abs() / a.abs().max(1e-300)
}

fn run(solver: &mut Solver, keep: &[usize]) -> (Vec<StepResult>, HashMap<usize, (Vec<f64>, Vec<f64>)>, Vec<([f64; 3], f64)>) {
    let mut fields = HashMap::new();
    let mut centers = Vec::new();
    let steps = solver
        .run(|s, sv| {
            assert!(s.converged);
            assert!(serde_json::to_value(s).unwrap().as_object().unwrap().values().all(|v| !v.is_null()));
            assert!(sv.d.iter().chain(&sv.u).all(|v| v.is_finite()));
            if keep.contains(&s.step) {
                fields.insert(s.step, (sv.d.clone(), sv.u.clone()));
            }
            centers.push(sv.center_stress(450.min(sv.problem.mesh.elements.len() - 1)).unwrap());
        })
        .unwrap();
    (steps, fields, centers)
}

/// For each node, the node at the mirror position ((x, -y) or (-x, y)); on the notch the two
/// copies swap.
fn mirror_map(m: &Mesh, about_x_axis: bool) -> Vec<usize> {
    let key = |x: f64, y: f64| ((x * 1e9).round() as i64, (y * 1e9).round() as i64);
    let mut at: HashMap<(i64, i64), Vec<usize>> = HashMap::new();
    for (i, p) in m.nodes.iter().enumerate() {
        at.entry(key(p[0], p[1])).or_default().push(i);
    }
    (0..m.nodes.len())
        .map(|i| {
            let [x, y] = m.nodes[i];
            let c = if about_x_axis { &at[&key(x, -y)] } else { &at[&key(-x, y)] };
            if c.len() == 2 { if c[0] == i { c[1] } else { c[0] } } else { c[0] }
        })
        .collect()
}

fn finite_max(a: f64, b: f64) -> f64 {
    assert!(a.is_finite() && b.is_finite(), "non-finite comparison");
    a.max(b)
}

fn max_abs(a: &[f64], b: &[f64]) -> f64 {
    assert_eq!(a.len(), b.len(), "field length mismatch");
    assert!(a.iter().chain(b).all(|v| v.is_finite()));
    a.iter().zip(b).map(|(x, y)| (x - y).abs()).fold(0.0, finite_max)
}

fn example1(c: &mut Checks) {
    let problem = bar_reference();
    let mesh_ref: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(dir().join("reference-results/ex1_mesh.json")).unwrap()).unwrap();
    let (n, e) = mesh_fingerprint(&problem.mesh);
    c.equal("ex1: mesh identical to the reference (node and element fingerprints)", n == mesh_ref["nodes_fnv1a64"] && e == mesh_ref["elements_fnv1a64"]);

    let mut solver = Solver::new(problem).unwrap();
    let (steps, fields, centers) = run(&mut solver, &[50, 73]);
    let reference = read_csv("ex1_steps.csv");
    assert_eq!(steps.len(), reference.len());
    c.equal("ex1: same number of load steps", steps.len() == reference.len());
    c.equal(
        "ex1: same number of staggered iterations at every step",
        steps.iter().zip(&reference).all(|(s, r)| r["staggered_iterations"] == s.iterations.to_string()),
    );
    let worst = steps.iter().zip(&reference).map(|(s, r)| rel(f(r, "damage_max"), s.damage_max)).fold(0.0, finite_max);
    c.at_most("ex1: maximum damage at every step", "relative difference", worst, 1e-9);
    let worst = centers.iter().zip(&reference).map(|((s, _), r)| (f(r, "center_sigma_xx") - s[0]).abs()).fold(0.0, finite_max);
    let sigma_c = (27.0f64 * 30.0 * 1.2e-4 / (256.0 * 10.0)).sqrt();
    c.at_most("ex1: stress at the bar centre at every step", "absolute difference / AT2 peak stress", worst / sigma_c, 1e-9);
    for k in [50usize, 73] {
        let d_ref = column(&format!("ex1_damage_step{k:03}.csv"), 0);
        c.at_most(&format!("ex1: nodal damage at step {k}"), "max absolute difference", max_abs(&d_ref, &fields[&k].0), 1e-8);
    }
    let ux = column("ex1_displacement_step050.csv", 0);
    let uy = column("ex1_displacement_step050.csv", 1);
    let u = &fields[&50].1;
    assert_eq!(ux.len(), uy.len());
    assert_eq!(u.len(), 2 * ux.len());
    let scale = ux.iter().chain(&uy).fold(0.0f64, |m, v| m.max(v.abs()));
    let diff = (0..ux.len()).map(|i| (ux[i] - u[2 * i]).abs().max((uy[i] - u[2 * i + 1]).abs())).fold(0.0, finite_max);
    c.at_most("ex1: nodal displacement at step 50", "max absolute difference / max |u|", diff / scale, 1e-8);

    // The reference's own analytical comparison: before localisation the bar is homogeneous and
    // the 1D AT2 solution gives sigma = sqrt(E Gc / l0 * d (1 - d)^3) for the computed d.
    let (e, gc, l0) = (30.0f64, 1.2e-4, 10.0);
    let worst = centers
        .iter()
        .zip(&steps)
        .filter(|(_, s)| s.damage_max < 0.25)
        .map(|((s, d), _)| (s[0] - (e * gc / l0 * d * (1.0 - d).powi(3)).sqrt()).abs() / sigma_c)
        .fold(0.0, finite_max);
    c.at_most("ex1: centre stress vs 1D AT2 homogeneous solution while max damage < 0.25", "absolute difference / AT2 peak stress", worst, 1e-3);
}

fn example2(c: &mut Checks) {
    let plate = NotchedPlate::reference();
    let problem = plate.problem().unwrap();
    let mesh_ref: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(dir().join("reference-results/ex2_mesh.json")).unwrap()).unwrap();
    let (n, e) = mesh_fingerprint(&problem.mesh);
    c.equal("ex2: mesh identical to the reference (node and element fingerprints)", n == mesh_ref["nodes_fnv1a64"] && e == mesh_ref["elements_fnv1a64"]);
    let mirror = mirror_map(&problem.mesh, true);
    let tol = plate.controls.tolerance;

    let mut solver = Solver::new(problem).unwrap();
    let (steps, fields, _) = run(&mut solver, &[56, 57, 78]);
    let reference = read_csv("ex2_steps.csv");
    assert_eq!(steps.len(), reference.len());
    c.equal("ex2: same number of load steps", steps.len() == reference.len());
    c.equal(
        "ex2: same number of staggered iterations at every step",
        steps.iter().zip(&reference).all(|(s, r)| r["staggered_iterations"] == s.iterations.to_string()),
    );
    let peak_ref = reference.iter().enumerate().max_by(|a, b| f(a.1, "reaction").total_cmp(&f(b.1, "reaction"))).unwrap();
    let peak = steps.iter().max_by(|a, b| a.reaction.total_cmp(&b.reaction)).unwrap();
    c.equal("ex2: peak force at the same load step", peak.step == peak_ref.0);
    c.at_most("ex2: peak force", "relative difference", rel(f(peak_ref.1, "reaction"), peak.reaction), 1e-9);
    let pre: Vec<_> = steps.iter().zip(&reference).filter(|(s, _)| s.step <= peak_ref.0).collect();
    let worst = pre.iter().map(|(s, r)| rel(f(r, "reaction"), s.reaction)).fold(0.0, finite_max);
    c.at_most("ex2: force at every step up to the peak", "relative difference", worst, 1e-9);
    let worst = pre.iter().map(|(s, r)| rel(f(r, "damage_max"), s.damage_max)).fold(0.0, finite_max);
    c.at_most("ex2: maximum damage at every step up to the peak", "relative difference", worst, 1e-9);
    let worst = steps.iter().zip(&reference).map(|(s, r)| (f(r, "reaction") - s.reaction).abs()).fold(0.0, finite_max);
    c.at_most("ex2: force at every step, including fracture (comparison tolerance)", "absolute difference, kN", worst, tol);

    let d_ref = column("ex2_damage_step056.csv", 0);
    c.at_most("ex2: nodal damage at the peak step 56", "max absolute difference", max_abs(&d_ref, &fields[&56].0), 1e-8);
    let ux = column("ex2_displacement_step056.csv", 0);
    let uy = column("ex2_displacement_step056.csv", 1);
    let u = &fields[&56].1;
    assert_eq!(ux.len(), uy.len());
    assert_eq!(u.len(), 2 * ux.len());
    let scale = ux.iter().chain(&uy).fold(0.0f64, |m, v| m.max(v.abs()));
    let diff = (0..ux.len()).map(|i| (ux[i] - u[2 * i]).abs().max((uy[i] - u[2 * i + 1]).abs())).fold(0.0, finite_max);
    c.at_most("ex2: nodal displacement at the peak step 56", "max absolute difference / max |u|", diff / scale, 1e-8);

    // The problem is symmetric about the notch plane, so the crack may run along the element row
    // just above or just below it; which one is decided by round-off. Compare with the reference
    // field as is and mirrored, and require one of them to match.
    for (k, tolerance) in [(57usize, 1e-4), (78, 1e-8)] {
        let d_ref = column(&format!("ex2_damage_step{k:03}.csv"), 0);
        let d = &fields[&k].0;
        let mirrored: Vec<f64> = (0..d_ref.len()).map(|i| d_ref[mirror[i]]).collect();
        let best = max_abs(&d_ref, d).min(max_abs(&mirrored, d));
        c.at_most(&format!("ex2: nodal damage at step {k}, reference or its mirror image"), "max absolute difference", best, tolerance);
    }
}

fn example3(c: &mut Checks) {
    let problem = three_point_bending_reference();
    let mesh_ref: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(dir().join("reference-results/ex3_mesh.json")).unwrap()).unwrap();
    let (n, e) = mesh_fingerprint(&problem.mesh);
    c.equal("ex3: mesh identical to the reference (node and element fingerprints)", n == mesh_ref["nodes_fnv1a64"] && e == mesh_ref["elements_fnv1a64"]);
    let mirror = mirror_map(&problem.mesh, false);
    let tol = problem.controls.tolerance;
    let mut solver = Solver::new(problem).unwrap();
    let (steps, fields, _) = run(&mut solver, &[56, 98]);
    let reference = read_csv("ex3_steps.csv");
    assert_eq!(steps.len(), reference.len());
    c.equal("ex3: same number of load steps", steps.len() == reference.len());
    c.equal(
        "ex3: same number of staggered iterations at every step",
        steps.iter().zip(&reference).all(|(s, r)| r["staggered_iterations"] == s.iterations.to_string()),
    );
    let peak_ref = reference.iter().enumerate().max_by(|a, b| f(a.1, "reaction").total_cmp(&f(b.1, "reaction"))).unwrap();
    let peak = steps.iter().max_by(|a, b| a.reaction.total_cmp(&b.reaction)).unwrap();
    c.equal("ex3: peak force at the same load step", peak.step == peak_ref.0);
    let worst = steps.iter().zip(&reference).filter(|(s, _)| s.step <= peak_ref.0).map(|(s, r)| rel(f(r, "reaction"), s.reaction)).fold(0.0, finite_max);
    c.at_most("ex3: force at every step up to the peak", "relative difference", worst, 1e-9);
    let worst = steps.iter().zip(&reference).map(|(s, r)| (f(r, "reaction") - s.reaction).abs()).fold(0.0, finite_max);
    c.at_most("ex3: force at every step, including fracture (comparison tolerance)", "absolute difference, kN", worst, tol);
    let d_ref = column("ex3_damage_step056.csv", 0);
    c.at_most("ex3: nodal damage at the peak step 56", "max absolute difference", max_abs(&d_ref, &fields[&56].0), 1e-8);
    let ux = column("ex3_displacement_step056.csv", 0);
    let uy = column("ex3_displacement_step056.csv", 1);
    let u = &fields[&56].1;
    assert_eq!(ux.len(), uy.len());
    assert_eq!(u.len(), 2 * ux.len());
    let scale = ux.iter().chain(&uy).fold(0.0f64, |m, v| m.max(v.abs()));
    let diff = (0..ux.len()).map(|i| (ux[i] - u[2 * i]).abs().max((uy[i] - u[2 * i + 1]).abs())).fold(0.0, finite_max);
    c.at_most("ex3: nodal displacement at the peak step 56", "max absolute difference / max |u|", diff / scale, 1e-8);
    let d_ref = column("ex3_damage_step098.csv", 0);
    let d = &fields[&98].0;
    let mirrored: Vec<f64> = (0..d_ref.len()).map(|i| d_ref[mirror[i]]).collect();
    c.at_most("ex3: nodal damage at the last step 98, reference or its mirror image", "max absolute difference", max_abs(&d_ref, d).min(max_abs(&mirrored, d)), 1e-8);
}

#[test]
fn validation_against_reference_code() {
    let mut c = Checks::default();
    example1(&mut c);
    example2(&mut c);
    example3(&mut c);
    let json = serde_json::to_string_pretty(&serde_json::json!({
        "reference": "reference-results/ (phasefield-jr-py, see MANIFEST.json)",
        "produced_by": "cargo test --release --test reference",
        "checks": c.0,
    }))
    .unwrap();
    let out = dir().join("target").join("VALIDATION.json");
    std::fs::create_dir_all(out.parent().unwrap()).unwrap();
    std::fs::write(&out, &json).unwrap();
    for ch in &c.0 {
        println!("{} {} [{}: {:.3e} <= {:.1e}]", if ch.passed { "ok  " } else { "FAIL" }, ch.name, ch.metric, ch.observed, ch.tolerance);
    }
    assert!(c.0.iter().all(|ch| ch.passed), "a validation check failed");

    let committed: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(dir().join("VALIDATION.json")).unwrap_or_else(|_| "{}".into())).unwrap();
    let now: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_records_equal(&committed, &now);
}

#[test]
#[should_panic(expected = "field length mismatch")]
fn field_comparison_rejects_missing_entries() { max_abs(&[1.0], &[]); }

#[test]
#[should_panic]
fn field_comparison_rejects_nan() { max_abs(&[f64::NAN], &[0.0]); }

#[test]
#[should_panic(expected = "non-finite comparison")]
fn maximum_rejects_nan() { finite_max(0.0, f64::NAN); }

fn assert_records_equal(expected: &serde_json::Value, actual: &serde_json::Value) {
    assert_eq!(expected, actual, "VALIDATION.json is stale: copy target/VALIDATION.json over it");
}

#[test]
fn validation_records_include_metrics_and_observations() {
    let record = serde_json::json!({"checks": [{"name": "force", "metric": "absolute", "tolerance": 1e-5, "observed": 1e-7, "passed": true}]});
    for (key, value) in [("metric", serde_json::json!("relative")), ("observed", serde_json::json!(1e-6))] {
        let mut changed = record.clone();
        changed["checks"][0][key] = value;
        assert!(std::panic::catch_unwind(|| assert_records_equal(&record, &changed)).is_err());
    }
}
