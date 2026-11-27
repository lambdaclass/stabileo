use cut_strip_feher_2026::{exact, load_cycle, loaded_height, prepare, Strip, LENGTH};
use serde_json::{json, Value};

const SOURCE: &str = "arXiv:2601.20793v2";
const HERE: &str = env!("CARGO_MANIFEST_DIR");
const CUT: f64 = 0.5;
const STEP: f64 = 0.05;
const HEIGHT_TOLERANCE: f64 = 0.7;
const LOAD_TOLERANCE: f64 = 0.06;

fn check(id: &str, metric: &str, observed: f64, tolerance: f64) -> Value {
    json!({"id": id, "metric": metric, "observed": observed, "tolerance": tolerance, "passed": observed.is_finite() && observed <= tolerance})
}

fn row(id: &str, name: String, source: String, unit: &str, reference: Option<f64>, computed: Option<f64>, tolerance: f64) -> Value {
    let observed = reference.zip(computed).map(|(r, c)| (c - r).abs());
    let mut result = json!({"id": id, "name": name, "source": source, "unit": unit, "reference": reference, "computed": computed,
        "metric": "absolute difference", "observed": observed, "tolerance": tolerance, "passed": observed.is_some_and(|e| e <= tolerance)});
    if observed.is_none() {
        result["status"] = json!("unresolved");
    }
    result
}

fn close(a: &Value, b: &Value, path: &str) -> Result<(), String> {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => {
            let (x, y) = (x.as_f64().unwrap(), y.as_f64().unwrap());
            if (x - y).abs() <= 1e-12 + 1e-6 * y.abs() { Ok(()) } else { Err(format!("{path}: {x} (committed {y})")) }
        }
        (Value::Array(x), Value::Array(y)) if x.len() == y.len() => x.iter().zip(y).enumerate().try_for_each(|(i, (p, q))| close(p, q, &format!("{path}[{i}]"))),
        (Value::Object(x), Value::Object(y)) if x.len() == y.len() => x.iter().try_for_each(|(k, p)| y.get(k).map_or(Err(format!("{path}.{k} missing")), |q| close(p, q, &format!("{path}.{k}")))),
        _ if a == b => Ok(()),
        _ => Err(format!("{path}: {a} (committed {b})")),
    }
}

fn figure(span: f64, b: f64) -> String {
    let panel = ["a", "b", "c"][[0.2, 0.5, 0.8].iter().position(|&x| x == b).unwrap()];
    format!("Figure {}({panel}) p. 9", if span == 0.5 { 10 } else { 11 })
}

fn main() {
    let write = std::env::args().any(|a| a == "--write");
    let digitized: Value = serde_json::from_str(&std::fs::read_to_string(format!("{HERE}/reference-results/fig10_11_digitized.json")).unwrap()).unwrap();
    let mut checks = vec![];
    let mut rows = vec![];
    let mut heights = serde_json::Map::new();
    for span in [0.5, 0.75] {
        for b in [0.2, 0.5, 0.8] {
            let strip = Strip { a: CUT, b };
            let ours = prepare(&strip, span * LENGTH).unwrap().height();
            let reference = exact::height(&strip, span * LENGTH, 0.0).unwrap();
            heights.insert(format!("{span}-{b}"), json!({"stabileo": ours, "elastica": reference}));
            checks.push(check(&format!("elastica-{span}-{b}"), &format!("B = {span}L, a = {CUT}, b = {b}, self-weight, no load: midpoint height against the inextensible elastica solved by shooting, relative difference"), ((ours - reference) / reference).abs(), 1e-3));
            let panel = digitized["panels"].as_array().unwrap().iter().find(|p| p["B_over_L"] == json!(span) && p["b"] == json!(b)).unwrap();
            let zero = panel["experiment"].as_array().unwrap().iter()
                .filter(|p| p[0].as_f64().unwrap().abs() <= 2.0 * 0.005)
                .min_by(|p, q| p[0].as_f64().unwrap().abs().total_cmp(&q[0].as_f64().unwrap().abs()));
            rows.push(row(&format!("height-{span}-{b}"), format!("Unloaded midpoint height, B = {span}L, a = {CUT}, b = {b}"),
                format!("{SOURCE}, {}, measured heights, digitized", figure(span, b)), "mm", zero.and_then(|p| p[1].as_f64()), Some(ours), HEIGHT_TOLERANCE));
        }
    }
    let strip = Strip { a: CUT, b: 0.5 };
    let ours = loaded_height(&strip, 0.5 * LENGTH, 1.0, STEP).unwrap();
    let reference = exact::height(&strip, 0.5 * LENGTH, 1.0).unwrap();
    checks.push(check("elastica-loaded-0.5-0.5", "B = 0.5L, a = 0.5, b = 0.5, self-weight and 1 N at midspan: midpoint height against the inextensible elastica, relative difference", ((ours - reference) / reference).abs(), 1e-3));

    for (span, b, back) in [(0.5, 0.2, false), (0.5, 0.5, false), (0.5, 0.5, true), (0.75, 0.2, false)] {
        let cycle = load_cycle(&Strip { a: CUT, b }, span * LENGTH, 4.0, STEP, 10.0).unwrap();
        let computed = cycle["points"].as_array().unwrap().windows(2).find_map(|pair| {
            let previous = &pair[0];
            let next = &pair[1];
            let load = next[0].as_f64()?;
            let increment = load - previous[0].as_f64()?;
            let rise = next[1].as_f64()? - previous[1].as_f64()?;
            ((back && increment < 0.0 && rise > 50.0) || (!back && increment > 0.0 && rise < -50.0)).then_some(load)
        });
        let panel = digitized["panels"].as_array().unwrap().iter().find(|p| p["B_over_L"] == json!(span) && p["b"] == json!(b)).unwrap();
        let loads = panel["unstable_curve"].as_array().unwrap().iter().map(|p| p[0].as_f64().unwrap());
        let reference = if back { loads.fold(f64::INFINITY, f64::min) } else { loads.fold(0.0, f64::max) };
        let kind = if back { "Snap-back load" } else { "Snap-through load" };
        rows.push(row(&format!("{}-{span}-{b}", if back { "snap-back" } else { "snap-through" }), format!("{kind}, B = {span}L, a = {CUT}, b = {b}"),
            format!("{SOURCE}, {}, end of the unstable branch, digitized", figure(span, b)), "N", Some(reference), computed, LOAD_TOLERANCE));
    }

    let validation = json!({
        "checks": checks,
        "heights_mm": heights,
        "scope": "Cut strip of Section 2 on the production co-rotational frame (136 members, N and mm, self-weight), against the inextensible elastica with the same variable stiffness and weight solved by shooting. Numerical comparison, not a laboratory test.",
    });
    let comparison = json!({
        "reproduced_published_results": false,
        "scope": "Zero-load heights where a measured marker lies within digitization uncertainty, and directional snap loads of the computed curves in Figures 10 and 11 (a = 0.5), digitized from the preprint. A missing zero-load marker or unobserved jump leaves the comparison unresolved.",
        "checks": rows,
    });
    let mut stale = false;
    for (name, fresh) in [("VALIDATION.json", &validation), ("reference-results/published_comparison.json", &comparison)] {
        let path = format!("{HERE}/{name}");
        if write {
            std::fs::write(&path, serde_json::to_string_pretty(fresh).unwrap() + "\n").unwrap();
        } else {
            let stored: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
            if let Err(at) = close(fresh, &stored, name) {
                println!("FAIL {name} differs from this run at {at}");
                stale = true;
            }
        }
    }
    for c in checks.iter().chain(&rows) {
        println!("{} {} {:.4e} (≤ {})", if c["passed"] == true { "ok  " } else { "FAIL" }, c["id"].as_str().unwrap(), c["observed"].as_f64().unwrap_or(f64::NAN), c["tolerance"]);
    }
    if stale || checks.iter().any(|c| c["passed"] != true) {
        std::process::exit(1);
    }
}
