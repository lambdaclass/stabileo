use masonry_arches_heyman_1966::{collapse, hinges, kinematic, least_thickness, run, PointLoad, Weights};
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

fn read(name: &str) -> Value {
    serde_json::from_str(&std::fs::read_to_string(format!("{HERE}/reference-results/{name}")).unwrap()).unwrap()
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
            let symmetric = r.hinges.len() == 5 && r.hinges[0].joint == 0 && r.hinges[4].joint == n && r.hinges[1].joint + r.hinges[3].joint == n && 2 * r.hinges[2].joint == n;
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
        let found: Vec<usize> = hinges(&arch, &s.e, 1e-6).iter().map(|h| h.joint).collect();
        let theirs: Vec<usize> = c["hinges"].as_array().unwrap().iter().map(|h| h[0].as_u64().unwrap() as usize).collect();
        if found != theirs {
            hinge_mismatch += 1.0;
        }
        worst_python = worst_python.max(((s.lambda - c["P_collapse_kN"].as_f64().unwrap()) / s.lambda).abs());
        let kin = (n <= run::KINEMATIC_MAX).then(|| kinematic(&arch, &load).unwrap().0);
        if let Some(k) = kin {
            worst_bounds = worst_bounds.max(((k - s.lambda) / s.lambda).abs());
        }
        ring_rows.push(json!({"n": n, "static": s.lambda, "kinematic": kin, "hinges": found.iter().map(|&j| (arch.phi(j) - arch.phi(0)).to_degrees()).collect::<Vec<_>>()}));
    }
    checks.push(check("ring-bounds", "ring under a quarter-span point load, N = 10 to 40: relative gap between the static multiplier and the smallest over every four-hinge mechanism", worst_bounds, 1e-9));
    let mut c = check("ring-python", "ring under a quarter-span point load, N = 10 to 160: largest relative difference in the collapse load from the Python/HiGHS implementation", worst_python, 1e-6);
    c["source"] = json!(PYTHON);
    checks.push(c);
    checks.push(check("ring-hinges", "ring under a quarter-span point load, N = 10 to 160: cases whose hinge joints differ from the Python/HiGHS implementation", hinge_mismatch, 0.0));

    let fresh = run::replay().unwrap();
    let stored = std::fs::read_to_string(format!("{HERE}/reference-results/replay.json")).unwrap();
    let same = serde_json::to_string(&fresh).unwrap() + "\n" == stored;
    checks.push(check("replay", "replay.json against a fresh run: differs (0 = identical)", if same { 0.0 } else { 1.0 }, 0.0));

    let heyman: Vec<Value> = rizzi["rows"].as_array().unwrap().iter().zip(&table).map(|(row, ours)| {
        json!({"alpha": row["alpha"], "eta": row["heyman"]["eta"], "beta": row["heyman"]["beta"], "h": row["heyman"]["h"], "milankovitch_over_heyman": ours["milankovitch"]["eta"].as_f64().unwrap() / row["heyman"]["eta"].as_f64().unwrap() - 1.0})
    }).collect();

    let out = json!({
        "checks": checks,
        "least_thickness": table,
        "heyman_closed_form": heyman,
        "ring": ring_rows,
        "scope": "Rigid voussoirs with radial joints, no tension, unlimited compressive strength, no sliding; equilibrium checked at the joints. A numerical comparison with published analytical solutions and with an independent implementation, not a laboratory validation.",
    });
    let failed = checks.iter().filter(|c| c["passed"] != true).count();
    for c in &checks {
        println!("{} {} {:.3e} (≤ {})", if c["passed"] == true { "ok  " } else { "FAIL" }, c["id"].as_str().unwrap(), c["observed"].as_f64().unwrap(), c["tolerance"]);
    }
    if write {
        std::fs::write(format!("{HERE}/VALIDATION.json"), serde_json::to_string_pretty(&out).unwrap() + "\n").unwrap();
    }
    std::process::exit(if failed == 0 { 0 } else { 1 });
}
