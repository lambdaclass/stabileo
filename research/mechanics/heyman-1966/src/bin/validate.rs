use masonry_arches_heyman_1966::{Side, collapse, hinges, kinematic, least_thickness, run, PointLoad, Weights};
use serde_json::{json, Value};

const HERE: &str = env!("CARGO_MANIFEST_DIR");
const RIZZI: &str = "Rizzi, Cocchetti, Colasante & Rusconi (2010), doi:10.4028/www.scientific.net/AMR.133-134.467, Table 1, p. 469";
const PYTHON: &str = "reference-results/python_highs.json (reference/arch_limit.py, SciPy HiGHS)";

fn check(id: &str, metric: &str, observed: f64, tolerance: f64) -> Value {
    json!({"id": id, "metric": metric, "observed": observed, "tolerance": tolerance, "passed": observed.is_finite() && observed <= tolerance})
}

fn compared(id: &str, metric: &str, computed: f64, reference: f64, relative: bool, tolerance: f64, source: &str) -> Value {
    let observed = if relative { ((computed - reference) / reference).abs() } else { (computed - reference).abs() };
    let mut c = check(id, metric, observed, tolerance);
    c["computed"] = json!(computed);
    c["reference"] = json!(reference);
    c["source"] = json!(source);
    c
}

fn largest_difference(a: &Value, b: &Value) -> f64 {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => (x.as_f64().unwrap() - y.as_f64().unwrap()).abs(),
        (Value::Array(x), Value::Array(y)) if x.len() == y.len() => x.iter().zip(y).map(|(p, q)| largest_difference(p, q)).fold(0.0, f64::max),
        (Value::Object(x), Value::Object(y)) if x.len() == y.len() => x.iter().map(|(k, p)| y.get(k).map_or(f64::INFINITY, |q| largest_difference(p, q))).fold(0.0, f64::max),
        _ if a == b => 0.0,
        _ => f64::INFINITY,
    }
}

/// How far this run's numbers are from the committed ones, as a fraction of what is allowed: a
/// result may move by 10⁻⁹ of itself, and a check's `observed` (itself a small difference, which
/// round-off on another platform changes far more in relative terms) by 10⁻³ of its tolerance;
/// 10⁻¹² is allowed for everything. A different structure or text is infinite.
fn drift(a: &Value, b: &Value, allowed: Option<f64>, path: &str) -> (f64, String) {
    let worst = |items: Vec<(f64, String)>| items.into_iter().fold((0.0, String::new()), |m, x| if x.0 > m.0 { x } else { m });
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => {
            let (x, y) = (x.as_f64().unwrap(), y.as_f64().unwrap());
            let limit = 1e-12 + allowed.unwrap_or(1e-9 * y.abs());
            ((x - y).abs() / limit, format!("{path} = {x:e} (committed {y:e})"))
        }
        (Value::Array(x), Value::Array(y)) if x.len() == y.len() => worst(x.iter().zip(y).enumerate().map(|(i, (p, q))| drift(p, q, None, &format!("{path}[{i}]"))).collect()),
        (Value::Object(x), Value::Object(y)) if x.len() == y.len() => {
            let tolerance = y.get("tolerance").and_then(Value::as_f64);
            worst(
                x.iter()
                    .map(|(k, p)| {
                        let allowed = (k == "observed").then(|| tolerance.map(|t| 1e-3 * t)).flatten();
                        y.get(k).map_or((f64::INFINITY, format!("{path}.{k}")), |q| drift(p, q, allowed, &format!("{path}.{k}")))
                    })
                    .collect(),
            )
        }
        _ if a == b => (0.0, String::new()),
        _ => (f64::INFINITY, path.to_string()),
    }
}

fn read_root(name: &str) -> Value {
    serde_json::from_str(&std::fs::read_to_string(format!("{HERE}/{name}")).unwrap()).unwrap()
}

fn read(name: &str) -> Value {
    serde_json::from_str(&std::fs::read_to_string(format!("{HERE}/reference-results/{name}")).unwrap()).unwrap()
}

fn publish(directory: &str, out: &Value, comparison: &Value) {
    for evidence in [out, comparison] {
        let rows = evidence["checks"].as_array().expect("missing checks");
        assert!(!rows.is_empty() && rows.iter().all(|row| row["passed"] == true), "failed required checks");
    }
    let rows = comparison["checks"].as_array().unwrap();
    let mut ids: Vec<_> = rows.iter().map(|r| r["id"].as_str().expect("missing comparison id")).collect();
    let mut expected = Vec::new();
    for angle in [60, 90, 120, 145] {
        for solution in ["ccr", "milankovitch"] {
            for quantity in ["eta", "beta", "h"] {
                expected.push(format!("{solution}-{angle}-{quantity}"));
            }
        }
    }
    ids.sort_unstable();
    expected.sort_unstable();
    assert_eq!(ids, expected, "incomplete Rizzi table");
    std::fs::write(format!("{directory}/VALIDATION.json"), serde_json::to_string_pretty(out).unwrap() + "\n").unwrap();
    std::fs::write(format!("{directory}/reference-results/published_comparison.json"), serde_json::to_string_pretty(comparison).unwrap() + "\n").unwrap();
}

fn main() {
    let write = std::env::args().any(|a| a == "--write");
    let mut checks = vec![];
    let rizzi = read("rizzi2010_table1.json");
    let mut table = vec![];
    for row in rizzi["rows"].as_array().unwrap() {
        let alpha = row["alpha"].as_f64().unwrap();
        let n = 2 * (800.0 * alpha / 90.0).round() as usize;
        let mut ours = json!({"alpha": alpha, "n": n});
        for (weights, key, label) in [(Weights::True, "milankovitch", "true voussoir weights against Milankovitch"), (Weights::Centreline, "ccr", "weight on the centreline against CCR")] {
            let r = least_thickness(alpha.to_radians(), n, weights, 1e-12).unwrap();
            let p = &row[key];
            let a = alpha as i64;
            checks.push(compared(&format!("{key}-{a}-eta"), &format!("α = {a}°, {label}: least thickness t/r, relative difference ({n} voussoirs)"), r.eta, p["eta"].as_f64().unwrap(), true, 1e-4, RIZZI));
            checks.push(compared(&format!("{key}-{a}-beta"), &format!("α = {a}°, {label}: haunch hinge angle from the crown, degrees"), r.beta, p["beta"].as_f64().unwrap(), false, 0.01, RIZZI));
            checks.push(compared(&format!("{key}-{a}-h"), &format!("α = {a}°, {label}: H/(w r), relative difference"), r.h, p["h"].as_f64().unwrap(), true, 1e-4, RIZZI));
            ours[key] = json!({"eta": r.eta, "beta": r.beta, "h": r.h, "hinges": r.hinges.len()});
            let sides = [Side::Extrados, Side::Intrados, Side::Extrados, Side::Intrados, Side::Extrados];
            let symmetric = r.hinges.len() == 5
                && r.hinges.iter().zip(sides).all(|(h, side)| h.side == side)
                && r.hinges[0].joint == 0
                && r.hinges[4].joint == n
                && r.hinges[1].joint + r.hinges[3].joint == n
                && 2 * r.hinges[2].joint == n;
            checks.push(check(&format!("{key}-{a}-hinges"), &format!("α = {a}°, {label}: five hinges, symmetric, extrados at the crown and springings (0 = yes)"), if symmetric { 0.0 } else { 1.0 }, 0.0));
        }
        table.push(ours);
    }

    let python = read("python_highs.json");
    let mut worst: f64 = 0.0;
    for c in python["case1"]["results"].as_array().unwrap() {
        let n = c["n"].as_u64().unwrap() as usize;
        let weights = if c["weights"] == "true" { Weights::True } else { Weights::Centreline };
        let r = least_thickness(std::f64::consts::FRAC_PI_2, n, weights, 1e-12).unwrap();
        worst = worst.max(((r.eta - c["eta"].as_f64().unwrap()) / c["eta"].as_f64().unwrap()).abs());
    }
    let mut c = check("python-eta", "α = 90°, N = 10 to 201, both weight models: largest relative difference in t/r from the Python/HiGHS implementation", worst, 1e-5);
    c["source"] = json!(PYTHON);
    checks.push(c);

    let mut ring_rows = vec![];
    let (mut worst_python, mut worst_bounds, mut hinge_mismatch): (f64, f64, f64) = (0.0, 0.0, 0.0);
    for c in python["case2"]["results"].as_array().unwrap() {
        let n = c["n"].as_u64().unwrap() as usize;
        let arch = run::ring(n, run::RING_THICKNESS);
        let x = -run::RING_INNER_RADIUS / 2.0;
        let (block, _) = arch.extrados_point(x);
        let load = PointLoad { block, x, p: 1.0 };
        let s = collapse(&arch, &load).unwrap();
        let found: Vec<(usize, &str)> = hinges(&arch, &s.e, 1e-6).iter().map(|h| (h.joint, if h.side == Side::Extrados { "extrados" } else { "intrados" })).collect();
        let theirs: Vec<(usize, &str)> = c["hinges"].as_array().unwrap().iter().map(|h| (h[0].as_u64().unwrap() as usize, h[2].as_str().unwrap())).collect();
        if found != theirs {
            hinge_mismatch += 1.0;
        }
        worst_python = worst_python.max(((s.lambda - c["P_collapse_kN"].as_f64().unwrap()) / s.lambda).abs());
        let kin = (n <= run::KINEMATIC_MAX).then(|| kinematic(&arch, &load).unwrap().0);
        if let Some(k) = kin {
            worst_bounds = worst_bounds.max(((k - s.lambda) / s.lambda).abs());
        }
        ring_rows.push(json!({"n": n, "static": s.lambda, "kinematic": kin, "hinges": found.iter().map(|&(j, _)| (arch.phi(j) - arch.phi(0)).to_degrees()).collect::<Vec<_>>()}));
    }
    checks.push(check("ring-bounds", "ring under a quarter-span point load, N = 10 to 40: relative gap between the static multiplier and the smallest over every four-hinge mechanism", worst_bounds, 1e-9));
    let mut c = check("ring-python", "ring under a quarter-span point load, N = 10 to 160: largest relative difference in the collapse load from the Python/HiGHS implementation", worst_python, 1e-6);
    c["source"] = json!(PYTHON);
    checks.push(c);
    checks.push(check("ring-hinges", "ring under a quarter-span point load, N = 10 to 160: cases whose hinge joints or faces differ from the Python/HiGHS implementation", hinge_mismatch, 0.0));

    let fresh = run::replay().unwrap();
    let stored = read("replay.json");
    checks.push(check("replay", "replay.json against a fresh run: largest difference in any number (same structure, else infinite)", largest_difference(&fresh, &stored), 1e-6));

    let heyman: Vec<Value> = rizzi["rows"].as_array().unwrap().iter().zip(&table).map(|(row, ours)| {
        json!({"alpha": row["alpha"], "eta": row["heyman"]["eta"], "beta": row["heyman"]["beta"], "h": row["heyman"]["h"], "milankovitch_over_heyman": ours["milankovitch"]["eta"].as_f64().unwrap() / row["heyman"]["eta"].as_f64().unwrap() - 1.0})
    }).collect();

    let convergence: Vec<Value> = [51, 101, 201]
        .iter()
        .map(|&n| json!({"n": n, "eta": least_thickness(std::f64::consts::FRAC_PI_2, n, Weights::True, 1e-12).unwrap().eta}))
        .collect();
    let out = json!({
        "convergence": convergence,
        "checks": checks,
        "least_thickness": table,
        "heyman_closed_form": heyman,
        "ring": ring_rows,
        "scope": "Rigid voussoirs with radial joints, no tension, unlimited compressive strength, no sliding; equilibrium checked at the joints. A numerical comparison with published analytical solutions and with an independent implementation, not a laboratory validation.",
    });
    let published: Vec<Value> = rizzi["rows"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|row| {
            let a = row["alpha"].as_f64().unwrap() as i64;
            [("milankovitch", "Milankovitch, true voussoir weights"), ("ccr", "CCR, weight on the centreline")]
                .into_iter()
                .flat_map(move |(key, solution)| {
                    [("eta", "least thickness t/r", "", true, 1e-4), ("beta", "haunch hinge angle from the crown", "°", false, 0.01), ("h", "thrust H/(w r)", "", true, 1e-4)]
                        .map(|(quantity, what, unit, relative, tolerance)| (a, key, solution, quantity, what, unit, relative, tolerance))
                })
        })
        .map(|(a, key, solution, quantity, what, unit, relative, tolerance)| {
            let id = format!("{key}-{a}-{quantity}");
            let c = checks.iter().find(|c| c["id"] == id.as_str()).unwrap();
            json!({
                "id": id,
                "name": format!("α = {a}°, {solution}: {what}"),
                "source": RIZZI,
                "unit": unit,
                "reference": c["reference"],
                "computed": c["computed"],
                "metric": if relative { "relative difference" } else { "absolute difference" },
                "observed": c["observed"],
                "tolerance": tolerance,
                "passed": c["passed"],
            })
        })
        .collect();
    let comparison = json!({
        "reproduced_published_results": !published.is_empty() && published.iter().all(|row| row["passed"] == true),
        "scope": "Least thickness of circular arches under self-weight, α = 60° to 145°: the Milankovitch and CCR solutions tabulated by Rizzi et al. (2010). Heyman's own closed form in the same table is not compared: it places the resultant, not the line of thrust, tangent to the intrados.",
        "checks": published,
    });
    let failed = checks.iter().filter(|c| c["passed"] != true).count();
    for c in &checks {
        println!("{} {} {:.3e} (≤ {})", if c["passed"] == true { "ok  " } else { "FAIL" }, c["id"].as_str().unwrap(), c["observed"].as_f64().unwrap(), c["tolerance"]);
    }
    if write {
        publish(HERE, &out, &comparison);
    } else {
        let mut stale = false;
        for (name, fresh, stored) in [("VALIDATION.json", &out, read_root("VALIDATION.json")), ("reference-results/published_comparison.json", &comparison, read("published_comparison.json"))] {
            let (drift, at) = drift(fresh, &stored, None, "");
            println!("{} {name} against this run: largest difference {drift:.3e} of the allowed one{}{at}", if drift <= 1.0 { "ok  " } else { "FAIL" }, if at.is_empty() { "" } else { ", at " });
            stale |= drift > 1.0;
        }
        if stale {
            std::process::exit(1);
        }
    }
    std::process::exit(if failed == 0 { 0 } else { 1 });
}

#[test]
fn a_failed_check_preserves_both_evidence_files() {
    let folder = std::path::Path::new(HERE).join("target").join(format!("publication-{}", std::process::id()));
    std::fs::create_dir_all(folder.join("reference-results")).unwrap();
    let paths = [folder.join("VALIDATION.json"), folder.join("reference-results/published_comparison.json")];
    for path in &paths { std::fs::write(path, "previous").unwrap(); }
    let pass = json!({"checks": [{"passed": true}]});
    let fail = json!({"checks": [{"passed": false}]});
    for (validation, published) in [(&fail, &pass), (&pass, &fail)] {
        let outcome = std::panic::catch_unwind(|| publish(folder.to_str().unwrap(), validation, published));
        assert!(outcome.is_err());
        for path in &paths { assert_eq!(std::fs::read_to_string(path).unwrap(), "previous"); }
    }
    let complete = read("published_comparison.json");
    publish(folder.to_str().unwrap(), &pass, &complete);
    for (path, expected) in paths.iter().zip([pass, complete]) {
        assert_eq!(serde_json::from_slice::<Value>(&std::fs::read(path).unwrap()).unwrap(), expected);
    }
    std::fs::remove_dir_all(folder).unwrap();
}

#[test]
fn a_partial_rizzi_table_cannot_be_published() {
    let folder = std::path::Path::new(HERE).join("target").join(format!("partial-table-{}", std::process::id()));
    std::fs::create_dir_all(folder.join("reference-results")).unwrap();
    let all = read("published_comparison.json");
    for duplicate in [false, true] {
        let mut partial = all.clone();
        let rows = partial["checks"].as_array_mut().unwrap();
        rows.pop();
        if duplicate { rows.push(rows[0].clone()); }
        assert!(std::panic::catch_unwind(|| publish(folder.to_str().unwrap(), &all, &partial)).is_err());
        assert!(!folder.join("VALIDATION.json").exists());
    }
    std::fs::remove_dir_all(folder).unwrap();
}
