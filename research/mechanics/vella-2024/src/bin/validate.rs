use serde_json::{json, Value};
use snap_symmetry_vella_2024::study::{study, Study, ASYMMETRIC};
use std::{fs, path::Path};

fn check(id: &str, metric: &str, observed: f64, tolerance: f64, source: &str) -> Value {
    json!({"id": id, "metric": metric, "observed": observed, "tolerance": tolerance, "passed": observed <= tolerance, "source": source})
}

fn published(id: &str, metric: &str, reference: f64, computed: f64, relative: bool, tolerance: f64, source: &str) -> Value {
    let observed = if relative { (computed / reference - 1.0).abs() } else { (computed - reference).abs() };
    json!({"id": id, "metric": metric, "reference": reference, "computed": computed, "relative": relative, "observed": observed,
           "tolerance": tolerance, "passed": observed <= tolerance, "source": source})
}

/// Our amplification at `rate`, interpolated on log µ̇ in a rate sweep.
fn ours_at(points: &[(f64, f64)], rate: f64) -> Option<f64> {
    points.windows(2).find(|w| w[0].0 <= rate && rate <= w[1].0).map(|w| {
        let f = (rate.ln() - w[0].0.ln()) / (w[1].0.ln() - w[0].0.ln());
        (w[0].1.ln() + f * (w[1].1.ln() - w[0].1.ln())).exp()
    })
}

fn figure_2c(root: &Path) -> Vec<(f64, f64)> {
    fs::read_to_string(root.join("reference-results/fig2c_digitized.csv"))
        .unwrap()
        .lines()
        .skip(1)
        .filter(|l| l.starts_with("simulation"))
        .map(|l| {
            let c: Vec<f64> = l.split(',').skip(1).map(|v| v.parse().unwrap()).collect();
            (c[0], c[1])
        })
        .collect()
}

fn first_below(points: &[(f64, f64)], level: f64) -> f64 {
    points.iter().find(|p| p.1 < level).map(|p| p.0).unwrap_or(f64::NAN)
}

fn evidence(s: &Study, root: &Path) -> (Value, Value) {
    let p: Value = serde_json::from_str(&fs::read_to_string(root.join("reference-results/published.json")).unwrap()).unwrap();
    let pv = |a: &str, b: &str| p[a][b]["value"].as_f64().unwrap();
    let src = |a: &str, b: &str| format!("arXiv:2312.13908v2 {}", p[a][b]["source"].as_str().unwrap());
    let a = &s.shallow_analytic;
    let omega_published = (-pv("shallow", "lambda2_natural_mu_quarter")).sqrt();
    let toy = &s.toy;
    let mut published_checks = vec![
        published("tau-asymmetric", "shallow theory: tau* with tan(tau*/2) = tau*/2", pv("shallow", "tau_asymmetric"), a.tau_asymmetric, false, 5e-4, &src("shallow", "tau_asymmetric")),
        published("tau-fold", "shallow theory: tau at the fold of Eq. (S15)", pv("shallow", "tau_fold"), a.tau_fold, false, 5e-4, &src("shallow", "tau_fold")),
        published("mu-star-analytic", "shallow theory: mu* at the fold of Eq. (S15)", pv("shallow", "mu_star"), a.mu_star, false, 5e-4, &src("shallow", "mu_star")),
        published("mu-a-analytic", "shallow theory: mu(tau*) = mu_A", pv("shallow", "mu_a"), a.mu_a, false, 1e-12, &src("shallow", "mu_a")),
        published("mu-a-fe", "FE, alpha = 0.02, L/h = 2e4, Richardson over 24/48/96 elements: mu_A", pv("shallow", "mu_a"), s.shallow.mu_a.value, true, 3e-4, &src("shallow", "mu_a")),
        published("mu-star-fe", "FE, alpha = 0.02, L/h = 2e4, Richardson over 24/48/96 elements: mu* against the exact fold of Eq. (S15)", a.mu_star, s.shallow.mu_star.value, true, 3e-4, &src("shallow", "mu_star")),
        published("omega-fe", "FE, alpha = 0.02, natural state at mu = 1/4: lowest (antisymmetric) frequency against sqrt(3348.04)", omega_published, s.shallow.omega.value, true, 3e-4, &src("shallow", "lambda2_natural_mu_quarter")),
        published("toy-mu-star", "toy model, beta = 0.110, L0C = 0.655: mu*vM (S65)", pv("toy", "mu_star"), toy.mu_star, true, 5e-3, &src("toy", "mu_star")),
        published("toy-mu-a", "toy model: mu_A^vM", pv("toy", "mu_a"), toy.mu_a, true, 5e-3, &src("toy", "mu_a")),
        published("toy-omega-lower", "toy model at mu = 1/4: lower frequency / t_osc (symmetric by our linearisation)", pv("toy", "omega_lower_over_t_osc"), toy.omega_symmetric, false, 1e-3, &src("toy", "omega_lower_over_t_osc")),
        published("toy-omega-upper", "toy model at mu = 1/4: upper frequency / t_osc (antisymmetric)", pv("toy", "omega_upper_over_t_osc"), toy.omega_antisymmetric, true, 5e-3, &src("toy", "omega_upper_over_t_osc")),
        published("toy-t-osc", "toy model: t_osc = 2 pi / omega_lower (S80)", pv("toy", "t_osc"), toy.t_osc, true, 1e-3, &src("toy", "t_osc")),
    ];
    let d = &s.dynamics;
    let order = |e: f64| (e - 2.0).abs();
    let sens = |parameter: &str, rate: f64| -> Vec<(f64, f64)> {
        d.sensitivity.iter().filter(|x| x.parameter == parameter && x.rate == rate).map(|x| (x.value, x.amplification)).collect()
    };
    let dt_change = [0.03, 0.1]
        .iter()
        .map(|&r| {
            let v = sens("dt", r);
            let a = v.iter().find(|x| x.0 == 0.005).unwrap().1;
            let b = v.iter().find(|x| x.0 == 0.0025).unwrap().1;
            (a / b - 1.0).abs()
        })
        .fold(0.0, f64::max);
    let slow = d.seeded.iter().filter(|x| x.rate <= 0.01).map(|x| x.amplification).fold(f64::INFINITY, f64::min);
    let fast = d.seeded.iter().filter(|x| x.rate >= 0.3).map(|x| x.amplification).fold(0.0, f64::max);
    let unseeded = d.unseeded.iter().map(|x| x[1]).fold(0.0, f64::max);
    let mut checks = vec![
        check("order-mu-a", "alpha = pi/12: observed order of convergence of mu_A over 24/48/96 elements, distance from 2", order(s.paper.mu_a.order), 0.2, "mesh study"),
        check("order-mu-star", "alpha = pi/12: observed order of convergence of mu* over 24/48/96 elements, distance from 2", order(s.paper.mu_star.order), 0.2, "mesh study"),
        check("order-shallow-omega", "alpha = 0.02: observed order of convergence of the natural frequency, distance from 2", order(s.shallow.omega.order), 0.2, "mesh study"),
        check("asymmetric-first", "alpha = pi/12, 96 elements: mu* / mu_A (below 1: the antisymmetric instability comes first)", s.paper.meshes.last().map(|m| m.mu_star / m.mu_a).unwrap(), 0.995, "paper p. 2, Fig. 1c"),
        check("symmetric-protocol", "both clamps, no seed, rates 0.01-0.3: largest |theta| (rad), round-off amplified, against a seed of 1e-3", unseeded, 1e-6, "paper p. 2 and p. 14: both ends moved gives no asymmetry"),
        check("slow-amplifies", "seeded, rates <= 0.01: 1 / least amplification", 1.0 / slow, 0.1, "paper Fig. 2c: large A at slow rates"),
        check("fast-symmetric", "seeded, rates >= 0.3: largest amplification / 2", fast / ASYMMETRIC, 1.0, "paper Fig. 2c: A ~ 1 at fast rates"),
        check("dt", "amplification change from dt = 0.005 to 0.0025 T_osc, rates 0.03 and 0.1", dt_change, 0.02, "time-step study"),
    ];
    let figure = figure_2c(root);
    let one_end: Vec<(f64, f64)> = d.one_end.iter().map(|x| (x.rate, x.amplification)).collect();
    let envelope: Vec<(f64, f64)> = d.seeded.iter().map(|x| (x.rate, x.envelope)).collect();
    published_checks.push(published(
        "fig2c-transition",
        "Fig. 2c simulations: rate where A first falls below 2 (paper: first digitized point; ours: largest A over twelve seed phases); the paper's points cross A = 2 anywhere between 0.147 and 0.186",
        first_below(&figure, ASYMMETRIC),
        d.transition_envelope,
        true,
        0.2,
        "arXiv:2312.13908v2 p. 3, Fig. 2(c), read off the figure (reference/digitize_fig2c.py)",
    ));
    checks.extend(published_checks.iter().cloned());
    let band: Vec<(f64, f64)> = figure.iter().copied().filter(|p| (0.04..=0.1).contains(&p.0)).collect();
    let median_in_band = |ours: &[(f64, f64)]| {
        let mut v: Vec<f64> = band.iter().filter_map(|&(r, a)| ours_at(ours, r).map(|o| (o / a - 1.0).abs())).collect();
        v.sort_by(f64::total_cmp);
        v[v.len() / 2]
    };
    let fig = "arXiv:2312.13908v2 p. 3, Fig. 2(c), read off the figure (reference/digitize_fig2c.py)";
    let not_reproduced = vec![
        json!({"id": "fig2c-amplitude", "metric": "Fig. 2c simulations, 0.04 <= mu_dot <= 0.1: median |A_ours / A_paper - 1|, our largest A over twelve seed phases (ours lower at every point)",
               "observed": median_in_band(&envelope), "tolerance": 0.25, "passed": median_in_band(&envelope) <= 0.25, "source": fig}),
        json!({"id": "fig2c-amplitude-one-end", "metric": "Fig. 2c simulations, 0.04 <= mu_dot <= 0.1: median |A_ours / A_paper - 1|, our one-clamp protocol from DeltaL/L = 0.2 (ours lower at every point)",
               "observed": median_in_band(&one_end), "tolerance": 0.25, "passed": median_in_band(&one_end) <= 0.25, "source": fig}),
        {
            let observed = (toy.critical_rate / pv("toy", "critical_rate") - 1.0).abs();
            json!({"id": "toy-critical-rate", "metric": "toy model critical rate: |ours / paper - 1|; ours integrates (S84)-(S85) and bisects on whether the trajectory reaches f < 0, the paper's comes from the near-saddle-node reduction (S87)-(S92)",
                   "reference": pv("toy", "critical_rate"), "computed": toy.critical_rate, "relative": true,
                   "observed": observed, "tolerance": 0.01, "passed": observed <= 0.01, "source": src("toy", "critical_rate")})
        },
    ];
    let rows: Vec<Value> = figure
        .iter()
        .filter(|p| p.0 <= 0.3)
        .map(|&(rate, a)| {
            let o = ours_at(&one_end, rate);
            let e = ours_at(&envelope, rate);
            json!({"rate": rate, "paper": a, "one_end": o, "one_end_error": o.map(|v| v / a - 1.0), "envelope": e, "envelope_error": e.map(|v| v / a - 1.0)})
        })
        .collect();
    let median = |key: &str| {
        let mut v: Vec<f64> = rows.iter().filter_map(|r| r[key].as_f64()).map(f64::abs).collect();
        v.sort_by(f64::total_cmp);
        v.get(v.len() / 2).copied().unwrap_or(f64::NAN)
    };
    let differences = json!({
        "toy_critical_rate": {"paper": pv("toy", "critical_rate"), "ours": toy.critical_rate, "relative": toy.critical_rate / pv("toy", "critical_rate") - 1.0,
            "note": "ours integrates (S84)-(S85) and bisects on whether min f < 0; the paper's 0.0961 comes from the near-saddle-node reduction (S87)-(S92)"},
        "figure_2c": {"rows": rows, "median_abs_error_one_end": median("one_end_error"), "median_abs_error_envelope": median("envelope_error"),
            "paper_first_rate_below_2": first_below(&figure, ASYMMETRIC), "ours_one_end_first_rate_below_2": first_below(&one_end, ASYMMETRIC),
            "ours_seeded_transition": d.transition, "ours_envelope_transition": d.transition_envelope},
    });
    published_checks.retain(|c| c["passed"] == true);
    assert!(not_reproduced.iter().all(|c| c["passed"] == false), "a comparison listed as not reproduced now passes: move it to the checks");
    let validation = json!({
        "checks": checks,
        "not_reproduced": not_reproduced,
        "differences": differences,
        "scope": "Production co-rotational statics and research HHT-alpha dynamics of an elastica strip clamped at +/-alpha; the paper's shallow theory, its toy model and its published numbers. No laboratory validation; the paper's DER code is not available and was not run.",
    });
    (validation, json!({"checks": published_checks}))
}

/// The bands are justified in the README (Evidence); `passed` and every non-number must match exactly.
fn compare(a: &Value, b: &Value, path: &str, band: Option<f64>, out: &mut Vec<String>) {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => {
            let (x, y) = (x.as_f64().unwrap(), y.as_f64().unwrap());
            let allowed = band.unwrap_or(1e-8 + 1e-6 * x.abs().max(y.abs()));
            if (x - y).abs() > allowed {
                out.push(format!("{path}: {x} vs {y} (allowed {allowed:e})"));
            }
        }
        (Value::Array(x), Value::Array(y)) if x.len() == y.len() => {
            for (i, (u, v)) in x.iter().zip(y).enumerate() {
                compare(u, v, &format!("{path}[{i}]"), None, out);
            }
        }
        (Value::Array(x), Value::Array(y)) => out.push(format!("{path}: {} entries vs {}", x.len(), y.len())),
        (Value::Object(x), Value::Object(y)) => {
            for k in x.keys().filter(|k| !y.contains_key(*k)).chain(y.keys().filter(|k| !x.contains_key(*k))) {
                out.push(format!("{path}.{k}: in one of the two only"));
            }
            let observed_band = x.get("tolerance").and_then(Value::as_f64).filter(|_| x.contains_key("observed")).map(|t| 1e-3 * t);
            for (k, v) in x.iter().filter(|(k, _)| y.contains_key(*k)) {
                compare(v, &y[k], &format!("{path}.{k}"), if k == "observed" { observed_band } else { None }, out);
            }
        }
        _ if a == b => {}
        _ => out.push(format!("{path}: {} vs {}", short(a), short(b))),
    }
}

fn short(v: &Value) -> String {
    let s = v.to_string();
    if s.len() > 120 { format!("{}…", &s[..s.char_indices().nth(120).map_or(s.len(), |(i, _)| i)]) } else { s }
}

fn main() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let write = std::env::args().any(|a| a == "--write");
    let s = study().expect("the study runs");
    let (validation, published) = evidence(&s, root);
    let files = [
        ("reference-results/study.json", serde_json::to_value(&s).unwrap()),
        ("VALIDATION.json", validation),
        ("reference-results/published_comparison.json", published),
    ];
    for c in files[1].1["checks"].as_array().unwrap() {
        println!("{} {}: {} (tolerance {})", if c["passed"] == true { "ok  " } else { "FAIL" }, c["id"], c["observed"], c["tolerance"]);
    }
    assert!(files[1].1["checks"].as_array().unwrap().iter().all(|c| c["passed"] == true), "a check failed");
    let mut stale = vec![];
    for (name, value) in &files {
        let target = root.join(name);
        if write {
            fs::write(&target, format!("{}\n", serde_json::to_string_pretty(value).unwrap())).unwrap();
        } else {
            let stored: Value = serde_json::from_str(&fs::read_to_string(&target).unwrap()).unwrap();
            compare(value, &stored, name, None, &mut stale);
        }
    }
    for e in stale.iter().take(40) {
        eprintln!("stale evidence: {e}");
    }
    assert!(stale.is_empty(), "{} stored numbers differ from a fresh run (first ones above)", stale.len());
    println!("evidence {}", if write { "written" } else { "matches a fresh run" });
}
