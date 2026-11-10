use serde_json::{json, Value};
use shape_control_feher_2026::{bend, curvature_at, limit_load, run, span, Distribution, Setting};

const SOURCE: &str = "Fehér, Sipos & Várkonyi, doi:10.1016/j.euromechsol.2025.106000; arXiv:2509.12916v1";

fn check(metric: &str, observed: f64, tolerance: f64) -> Value {
    json!({"metric": metric, "observed": observed, "tolerance": tolerance, "passed": observed.is_finite() && observed <= tolerance})
}

fn published(metric: &str, computed: Option<f64>, reference: f64, tolerance: f64, where_: &str) -> Value {
    let observed = computed.map(|c| ((c - reference) / reference).abs()).unwrap_or(f64::INFINITY);
    json!({
        "metric": metric, "computed": computed, "reference": reference, "observed": if observed.is_finite() { json!(observed) } else { json!(null) },
        "tolerance": tolerance, "passed": observed <= tolerance, "source": format!("{SOURCE}, {where_}")
    })
}

fn main() {
    let write = std::env::args().any(|a| a == "--write");
    let mut checks = vec![];
    let mut published_checks = vec![];

    let circle = bend(96, Setting { theta: 1.0, delta: 0.0, q: 0.0 }, Distribution::Uniform, 2).unwrap().snapshot();
    let radius = 0.5;
    let centre = (span() / 2.0, -radius * 1f64.cos());
    let radial = circle.x.iter().zip(&circle.y).map(|(x, y)| (((x - centre.0).powi(2) + (y - centre.1).powi(2)).sqrt() - radius).abs() / radius).fold(0.0, f64::max);
    checks.push(check("unloaded strip at Θ = 1: largest distance from the exact circular arc, relative to its radius", radial, 1e-4));
    checks.push(check("unloaded strip at Θ = 1: curvature relative error against the exact 2", (circle.max_curvature - 2.0).abs() / 2.0, 1e-3));

    let replay: Value = serde_json::from_str(&std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/reference-results/replay.json")).unwrap()).unwrap();
    let fresh = run::path(run::CORNER.0, run::CORNER.1).unwrap();
    let frames = fresh["frames"].as_array().unwrap();
    checks.push(check("replay.json against a fresh run: frames that differ", if fresh == replay { 0.0 } else { 1.0 }, 0.0));
    checks.push(check("Section 3.4 path: states with an indefinite tangent", frames.iter().filter(|f| !f["stable"].as_bool().unwrap()).count() as f64, 0.0));
    checks.push(check("Section 3.4 path: jumps between neighbouring states", fresh["snaps"].as_array().unwrap().len() as f64, 0.0));

    let ends = |n: usize| {
        let start = bend(n, Setting { theta: 1.0, delta: 0.0, q: 2.5 }, Distribution::Uniform, 2).unwrap().snapshot().y_mid;
        (start, frames.last().unwrap()["y_mid"].as_f64().unwrap())
    };
    let coarse = ends(run::ELEMENTS).0;
    let fine = ends(2 * run::ELEMENTS).0;
    checks.push(check("arch at Θ = 1, q = 2.5: y(1/2) change from 60 to 120 elements, relative", ((coarse - fine) / fine).abs(), 1e-3));

    let digitized: Value = serde_json::from_str(&std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/reference-results/fig9c_digitized.json")).unwrap()).unwrap();
    let mut matches = serde_json::Map::new();
    for (label, points) in digitized["curves"].as_object().unwrap() {
        let points: Vec<(f64, f64)> = points.as_array().unwrap().iter().map(|p| (p[0].as_f64().unwrap(), p[1].as_f64().unwrap())).collect();
        let mut best = (f64::INFINITY, 0usize);
        for (i, f) in frames.iter().enumerate() {
            let xs: Vec<f64> = f["ux"].as_array().unwrap().iter().enumerate().map(|(k, u)| k as f64 / run::ELEMENTS as f64 + u.as_f64().unwrap()).collect();
            let ys: Vec<f64> = f["uz"].as_array().unwrap().iter().map(|u| u.as_f64().unwrap()).collect();
            let mut d: Vec<f64> = points
                .iter()
                .map(|&(px, py)| {
                    xs.windows(2).zip(ys.windows(2)).map(|(x, y)| {
                        let (ax, ay, bx, by) = (x[0], y[0], x[1], y[1]);
                        let t = (((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax).powi(2) + (by - ay).powi(2))).clamp(0.0, 1.0);
                        (px - ax - t * (bx - ax)).hypot(py - ay - t * (by - ay))
                    }).fold(f64::INFINITY, f64::min)
                })
                .collect();
            d.sort_by(|a, b| a.partial_cmp(b).unwrap());
            let median = d[d.len() / 2];
            if median < best.0 {
                best = (median, i);
            }
        }
        let f = &frames[best.1];
        matches.insert(label.clone(), json!({"step": best.1, "theta": f["theta"], "delta": f["delta"], "median_distance": best.0}));
        published_checks.push(json!({
            "metric": format!("Figure 9(c) shape {label}: median distance to the closest state on our path"),
            "computed": best.0, "reference": 0.0, "observed": best.0, "tolerance": 0.008, "passed": best.0 <= 0.008,
            "source": format!("{SOURCE}, Figure 9(c) p.24, digitized (reference-results/fig9c_digitized.json)")
        }));
    }
    let on = |label: &str, theta: f64, delta: f64, last: bool| {
        let m = &matches[label];
        let step = m["step"].as_u64().unwrap() as usize;
        ((m["theta"].as_f64().unwrap() - theta).abs() + (m["delta"].as_f64().unwrap() - delta).abs() < 0.06) && (!last || step + 3 >= frames.len())
    };
    checks.push(check("shapes 1 and 5 of Figure 9(c) are the start and the end of the path, both at Θ = 1, Δ = 0", if on("1", 1.0, 0.0, false) && on("5", 1.0, 0.0, true) { 0.0 } else { 1.0 }, 0.0));

    let qlim = |theta, delta, d| limit_load(96, theta, delta, d, 10.0, 1.0).unwrap().map(|(q, _)| q);
    published_checks.push(published("Section 3.2.1: limit load, uniform load, Θ = 0.9, Δ = 0 (paper −4.2, downward)", qlim(0.9, 0.0, Distribution::Uniform), 4.2, 0.05, "Sec. 3.2.1 p.18"));
    published_checks.push(published("Section 3.2.1: limit load, uniform load, Θ = 0.9, Δ = 0.04 (paper −3.9, downward)", qlim(0.9, 0.04, Distribution::Uniform), 3.9, 0.05, "Sec. 3.2.1 p.19"));
    published_checks.push(published("Section 3.2.1: limit load, half-span load, Θ = 0.9, Δ = 0 (paper −2.5, downward)", qlim(0.9, 0.0, Distribution::Asymmetric), 2.5, 0.05, "Sec. 3.2.1 p.19"));
    published_checks.push(published("Section 3.2.1: limit load, half-span load, Θ = 0.66, Δ = 1.36 (paper −4.0, downward)", qlim(0.66, 1.36, Distribution::Asymmetric), 4.0, 0.05, "Sec. 3.2.1 p.19"));
    let kappa = |theta, delta, d| curvature_at(96, theta, delta, d, 2.5).ok().map(|(k, _)| k);
    published_checks.push(published("Table 1: largest curvature at q = 2.5, uniform load, Θ = 0.96, Δ = 0", kappa(0.96, 0.0, Distribution::Uniform), 2.1, 0.05, "Table 1 p.20"));
    published_checks.push(published("Table 1: largest curvature at q = 2.5, half-span load, Θ = 0.96, Δ = 0", kappa(0.96, 0.0, Distribution::Asymmetric), 7.6, 0.05, "Table 1 p.20"));
    published_checks.push(published("Table 1: largest curvature at q = 2.5, uniform load, Θ = 0.64, Δ = 1.16", kappa(0.64, 1.16, Distribution::Uniform), 11.7, 0.05, "Table 1 p.20"));
    published_checks.push(published("Table 1: largest curvature at q = 2.5, half-span load, Θ = 0.64, Δ = 1.16", kappa(0.64, 1.16, Distribution::Asymmetric), 3.35, 0.05, "Table 1 p.20"));

    let validation = json!({
        "checks": checks,
        "published_checks": published_checks,
        "figure_9c_matches": matches,
        "scope": "Planar inextensible elastica approximated by the production co-rotational frame (60–96 elements, EA/EI·L² = 8·10⁵·π²); stability from the definiteness of the tangent. Numerical comparison with the paper's figures and text, not laboratory validation.",
    });
    let text = serde_json::to_string_pretty(&validation).unwrap() + "\n";
    if write {
        std::fs::write(concat!(env!("CARGO_MANIFEST_DIR"), "/VALIDATION.json"), &text).unwrap();
    }
    print!("{text}");
}
