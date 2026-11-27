use serde_json::{json, Map, Value};
use snap_symmetry_vella_2024::study::{first_downward_bracket, study, BranchPoint, Figure2a, Study, ASYMMETRIC, PAPER_ALPHA, PHASES, RATES};
use snap_symmetry_vella_2024::units::SIMULATIONS;
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

/// The values of an expected, non-empty group of runs, refused if any is missing or not finite.
fn finite(values: &[f64], what: &str) -> Result<Vec<f64>, String> {
    if values.is_empty() {
        return Err(format!("{what}: no runs"));
    }
    if let Some(v) = values.iter().find(|v| !v.is_finite()) {
        return Err(format!("{what}: non-finite value {v}"));
    }
    Ok(values.to_vec())
}

fn largest(values: &[f64], what: &str) -> Result<f64, String> {
    Ok(finite(values, what)?.into_iter().fold(f64::NEG_INFINITY, f64::max))
}

fn least(values: &[f64], what: &str) -> Result<f64, String> {
    Ok(finite(values, what)?.into_iter().fold(f64::INFINITY, f64::min))
}

fn exact_values(actual: impl Iterator<Item=f64>, expected: &[f64]) -> bool {
    let mut actual: Vec<_> = actual.collect();
    let mut expected = expected.to_vec();
    actual.sort_by(f64::total_cmp);
    expected.sort_by(f64::total_cmp);
    actual == expected
}

/// Every run the checks reduce over is present, snapped (its jump metrics are finite) and
/// finite before anything is reduced.
fn complete(s: &Study) -> Result<(), String> {
    let d = &s.dynamics;
    for (name, points) in [("seeded", &d.seeded), ("one_end", &d.one_end)] {
        let rates: Vec<f64> = points.iter().map(|p| p.rate).collect();
        if rates != RATES {
            return Err(format!("{name}: rates {rates:?}, expected {RATES:?}"));
        }
        for p in points.iter() {
            finite(&[p.amplification, p.amplification_from_mu_a, p.t_snap, p.mu_snap, p.theta_before, p.theta_during], &format!("{name} at {}", p.rate))?;
            if name == "seeded" {
                finite(&[p.envelope.ok_or("missing envelope")?], &format!("seeded envelope at {}", p.rate))?;
            }
        }
    }
    let unseeded: Vec<f64> = d.unseeded.iter().map(|u| u[0]).collect();
    if unseeded != [0.01, 0.03, 0.1, 0.3] {
        return Err(format!("unseeded: rates {unseeded:?}"));
    }
    finite(&d.unseeded.iter().map(|u| u[1]).collect::<Vec<_>>(), "unseeded")?;
    let expected: [(&str, &[f64]); 5] = [
        ("dt", &[0.02, 0.01, 0.005, 0.0025]), ("hht", &[-0.05, -0.1, -0.2, -0.3]),
        ("imperfection", &[1e-4, 3e-4, 1e-3, 3e-3, 1e-2]), ("n", &[24., 48., 96.]),
        ("start", &[0.4, 0.6, 1.0, d.one_end_start]),
    ];
    for rate in [0.03, 0.1] {
        for (parameter, values) in expected {
            let rows: Vec<_> = d.sensitivity.iter().filter(|x| x.parameter == parameter && x.rate == rate).collect();
            if !exact_values(rows.iter().map(|x| x.value), values) {
                return Err(format!("sensitivity {parameter} at {rate}: expected each of {values:?} once"));
            }
            for x in rows {
                finite(&[x.value, x.amplification, x.envelope, x.t_snap, x.mu_snap], &format!("sensitivity {parameter} = {} at {rate}", x.value))?;
            }
        }
    }
    if d.sensitivity.len() != 2 * expected.iter().map(|e| e.1.len()).sum::<usize>() {
        return Err(format!("sensitivity: {} runs", d.sensitivity.len()));
    }
    if !exact_values(d.figure_2a.iter().map(|f| f.rate_m_s), &[0.0018, 0.2466]) {
        return Err("figure 2a: two runs expected".into());
    }
    let seeded_runs = RATES.len() * PHASES + 2 * expected.iter().map(|e| e.1.len()).sum::<usize>() * PHASES;
    let others = RATES.len() + d.unseeded.len() + d.figure_2a.len();
    if d.runs != seeded_runs + others {
        return Err(format!("{} dynamic runs, expected {}", d.runs, seeded_runs + others));
    }
    Ok(())
}

/// Midpoint height (in αL) where `value` first changes sign from positive to non-positive along
/// the branch, interpolated linearly between the two branch points around it.
fn zero_crossing(branch: &[BranchPoint], value: impl Fn(&BranchPoint) -> f64) -> Result<f64, String> {
    branch
        .windows(2)
        .find(|w| value(&w[0]) > 0.0 && value(&w[1]) <= 0.0)
        .map(|w| {
            let (a, b) = (value(&w[0]), value(&w[1]));
            w[0].height + (w[1].height - w[0].height) * a / (a - b)
        })
        .ok_or_else(|| "no sign change along the inverted branch".into())
}

/// |slope of travel against time on the constant-speed part before µ* (−1 ≤ t/T_osc ≤ 0) / the
/// run's |ΔL̇| − 1|, over both Fig. 2a runs.
fn figure_2a_rate(figures: &[Figure2a]) -> Result<f64, String> {
    let mm_per_mu = 1000.0 * PAPER_ALPHA.powi(2) * SIMULATIONS.length;
    let mut errors = Vec::new();
    for f in figures {
        let window: Vec<usize> = (0..f.trace.t.len()).filter(|&i| (-1.0..=0.0).contains(&f.trace.t[i])).collect();
        let (&a, &b) = window.first().zip(window.last()).filter(|(a, b)| a < b).ok_or("figure 2a: no constant-speed window")?;
        let duration = f.time_s[b] - f.time_s[a];
        let clamp_mm = (f.trace.mu[a] - f.trace.mu[b]) * mm_per_mu;
        for distance_mm in [f.travel_mm[b] - f.travel_mm[a], clamp_mm] {
            let slope_mm_s = distance_mm / duration;
            errors.push((0.001 * slope_mm_s / f.rate_m_s - 1.0).abs());
        }
    }
    largest(&errors, "figure 2a slope")
}

fn first_below(points: &[(f64, f64)], level: f64) -> f64 {
    points.iter().find(|p| p.1 < level).map(|p| p.0).unwrap_or(f64::NAN)
}

fn evidence(s: &Study, root: &Path) -> Result<(Value, Value), String> {
    complete(s)?;
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
        published("toy-omega-lower", "toy model at mu = 1/4: lower angular frequency omega sqrt(m/k)/alpha, dimensionless (printed omega_A/t_osc; symmetric by our linearisation)", pv("toy", "omega_lower"), toy.omega_symmetric, false, 1e-3, &src("toy", "omega_lower")),
        published("toy-omega-upper", "toy model at mu = 1/4: upper angular frequency omega sqrt(m/k)/alpha, dimensionless (printed omega_S/t_osc; antisymmetric)", pv("toy", "omega_upper"), toy.omega_antisymmetric, true, 5e-3, &src("toy", "omega_upper")),
        published("toy-t-osc", "toy model: t_osc = 2 pi / omega_lower (S80), in units of sqrt(m/k)/alpha", pv("toy", "t_osc"), toy.t_osc, true, 1e-3, &src("toy", "t_osc")),
    ];
    let d = &s.dynamics;
    let order = |e: f64| (e - 2.0).abs();
    let sens = |parameter: &str, rate: f64| -> Vec<(f64, f64)> {
        d.sensitivity.iter().filter(|x| x.parameter == parameter && x.rate == rate).map(|x| (x.value, x.amplification)).collect()
    };
    let mut dt_changes = vec![];
    for r in [0.03, 0.1] {
        let v = sens("dt", r);
        let at = |dt: f64| v.iter().find(|x| x.0 == dt).map(|x| x.1).ok_or(format!("no dt = {dt} run at {r}"));
        dt_changes.push((at(0.005)? / at(0.0025)? - 1.0).abs());
    }
    let dt_change = largest(&dt_changes, "dt change")?;
    let slow = least(&d.seeded.iter().filter(|x| x.rate <= 0.01).map(|x| x.amplification).collect::<Vec<_>>(), "slow seeded runs")?;
    let fast = largest(&d.seeded.iter().filter(|x| x.rate >= 0.3).map(|x| x.amplification).collect::<Vec<_>>(), "fast seeded runs")?;
    let unseeded = largest(&d.unseeded.iter().map(|x| x[1].abs()).collect::<Vec<_>>(), "unseeded runs")?;
    let diagram = &s.diagram;
    let height_a = zero_crossing(&diagram.inverted, |p| p.spectrum.omega2_antisymmetric)?;
    let height_fold = zero_crossing(&diagram.inverted, |p| p.spectrum.omega2_symmetric)?;
    let heights = largest(&[(height_a - diagram.critical.height_a).abs(), (height_fold - diagram.critical.height_star).abs()], "critical heights")?;
    let rate_units = figure_2a_rate(&d.figure_2a)?;
    let mut checks = vec![
        check("order-mu-a", "alpha = pi/12: observed order of convergence of mu_A over 24/48/96 elements, distance from 2", order(s.paper.mu_a.order), 0.2, "mesh study"),
        check("order-mu-star", "alpha = pi/12: observed order of convergence of mu* over 24/48/96 elements, distance from 2", order(s.paper.mu_star.order), 0.2, "mesh study"),
        check("order-shallow-omega", "alpha = 0.02: observed order of convergence of the natural frequency, distance from 2", order(s.shallow.omega.order), 0.2, "mesh study"),
        check("asymmetric-first", "alpha = pi/12, 96 elements: mu* / mu_A (below 1: the antisymmetric instability comes first)", s.paper.meshes.last().map(|m| m.mu_star / m.mu_a).unwrap(), 0.995, "paper p. 2, Fig. 1c"),
        check("symmetric-protocol", "both clamps, no seed, rates 0.01-0.3: largest |theta| (rad), round-off amplified, against a seed of 1e-3", unseeded, 1e-6, "paper p. 2 and p. 14: both ends moved gives no asymmetry"),
        check("slow-amplifies", "seeded, rates <= 0.01: 1 / least amplification", 1.0 / slow, 0.1, "paper Fig. 2c: large A at slow rates"),
        check("fast-symmetric", "seeded, rates >= 0.3: largest amplification / 2", fast / ASYMMETRIC, 1.0, "paper Fig. 2c: A ~ 1 at fast rates"),
        check("dt", "amplification change from dt = 0.005 to 0.0025 T_osc, rates 0.03 and 0.1", dt_change, 0.02, "time-step study"),
        check("critical-heights", "alpha = pi/12, 48 elements: |h_A - h where omega2_antisymmetric crosses zero| and |h* - h where omega2_symmetric crosses zero| along the drawn inverted branch, in alpha L (linear interpolation between points 0.002 apart)", heights, CROSSING_TOLERANCE, "diagram"),
        check("fig2a-rate", "Fig. 2a runs: abs(0.001 * slope_mm_s / rate_m_s - 1), largest error for the paper time coordinate and clamp travel from shortening, -1 <= t/T_osc <= 0", rate_units, 1e-9, "units"),
    ];
    let figure = figure_2c(root);
    let one_end: Vec<(f64, f64)> = d.one_end.iter().map(|x| (x.rate, x.amplification)).collect();
    let envelope: Vec<(f64, f64)> = d.seeded.iter().map(|x| (x.rate, x.envelope.unwrap())).collect();
    let paper = first_downward_bracket(&figure)?.map(|(rate, _)| rate);
    let model = first_downward_bracket(&envelope)?.map(|(rate, _)| rate);
    let mut transition = published(
        "fig2c-transition", "Fig. 2c: first sampled rate below A = 2 after a downward crossing, paper simulations and twelve-phase model envelope",
        paper[1], model[1], true, 0.2,
        "arXiv:2312.13908v2 p. 3, Fig. 2(c), read off the figure (reference/digitize_fig2c.py)",
    );
    transition["paper_bracket"] = json!(paper);
    transition["model_bracket"] = json!(model);
    published_checks.push(transition);
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
    published_checks.extend(not_reproduced.iter().cloned());
    assert!(not_reproduced.iter().all(|c| c["passed"] == false), "a comparison listed as not reproduced now passes: move it to the checks");
    let validation = json!({
        "checks": checks,
        "not_reproduced": not_reproduced,
        "differences": differences,
        "scope": "Production co-rotational statics and research HHT-alpha dynamics of an elastica strip clamped at +/-alpha; the paper's shallow theory, its toy model and its published numbers. No laboratory validation; the paper's DER code is not available and was not run.",
    });
    Ok((validation, json!({"checks": published_checks})))
}

/// Linear interpolation of an eigenvalue between branch points 0.002 αL apart: README, Tolerances.
const CROSSING_TOLERANCE: f64 = 1e-4;

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
                let path = format!("{path}.{k}");
                if let Some(bands) = extrapolation_bands(x, y, k) {
                    for (field, band) in [("value", None), ("order", Some(bands.0)), ("correction", Some(bands.1))] {
                        compare(&v[field], &y[k][field], &format!("{path}.{field}"), band, out);
                    }
                    continue;
                }
                let band = match k.as_str() {
                    "observed" => observed_band,
                    "truncated_runs" | "runs" => Some(0.0),
                    _ => {
                        let band = spectrum_band(x, y, k);
                        if band.is_some() && v.as_f64().unwrap().signum() != y[k].as_f64().unwrap().signum() {
                            out.push(format!("{path}: stability sign changed"));
                        }
                        band
                    },
                };
                compare(v, &y[k], &path, band, out);
            }
        }
        _ if a == b => {}
        _ => out.push(format!("{path}: {} vs {}", short(a), short(b))),
    }
}

/// An eigenvalue's round-off error scales with the matrix, not with the eigenvalue (Weyl), so each
/// ω² and each stiffness is compared relative to the larger of its symmetric/antisymmetric pair.
fn spectrum_band(x: &Map<String, Value>, y: &Map<String, Value>, key: &str) -> Option<f64> {
    let kind = key.strip_suffix("_symmetric").or_else(|| key.strip_suffix("_antisymmetric")).filter(|k| ["omega2", "stiffness"].contains(k))?;
    let scale = [x, y]
        .iter()
        .flat_map(|m| ["symmetric", "antisymmetric"].map(|s| m.get(&format!("{kind}_{s}")).and_then(Value::as_f64)))
        .collect::<Option<Vec<f64>>>()?
        .into_iter()
        .fold(0.0_f64, |m, v| m.max(v.abs()));
    Some(1e-8 + 1e-6 * scale)
}

/// Bands for the Richardson order and correction of `key` in a mesh study: the first-order
/// propagation of the three mesh values' actual drift through d₁ = f₂ − f₁ and d₂ = f₃ − f₂,
/// doubled, plus round-off. The mesh values themselves are compared under the usual band.
fn extrapolation_bands(x: &Map<String, Value>, y: &Map<String, Value>, key: &str) -> Option<(f64, f64)> {
    let field = match key {
        "mu_a" | "mu_star" => key,
        "omega" => "omega_antisymmetric",
        _ => return None,
    };
    let values = |m: &Map<String, Value>| -> Option<Vec<f64>> { m.get("meshes")?.as_array()?.iter().rev().take(3).rev().map(|p| p[field].as_f64()).collect() };
    let (f, g) = (values(x)?, values(y)?);
    let drift: Vec<f64> = f.iter().zip(&g).map(|(a, b)| (a - b).abs()).collect();
    let (d1, d2) = (f[1] - f[0], f[2] - f[1]);
    let order = x.get(key)?["order"].as_f64()?;
    let correction = x.get(key)?["correction"].as_f64()?;
    let order_band = ((drift[0] + drift[1]) / d1.abs() + (drift[1] + drift[2]) / d2.abs()) / std::f64::consts::LN_2;
    let growth = 2f64.powf(order);
    let correction_band = correction.abs() * ((drift[1] + drift[2]) / d2.abs() + growth * std::f64::consts::LN_2 * order_band / (growth - 1.0));
    Some((2.0 * order_band + 1e-12 * order.abs(), 2.0 * correction_band + 1e-12 * correction.abs()))
}

fn short(v: &Value) -> String {
    let s = v.to_string();
    if s.len() > 120 { format!("{}…", &s[..s.char_indices().nth(120).map_or(s.len(), |(i, _)| i)]) } else { s }
}

fn main() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let write = std::env::args().any(|a| a == "--write");
    let s = study().expect("the study runs");
    let (validation, published) = evidence(&s, root).expect("the evidence is complete");
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

#[cfg(test)]
mod tests {
    use super::*;
    use snap_symmetry_vella_2024::study::richardson;

    fn study_of(omegas: [f64; 3]) -> Value {
        let r = richardson(omegas[0], omegas[1], omegas[2]).unwrap();
        json!({"meshes": omegas.map(|w| json!({"omega_antisymmetric": w})), "omega": {"value": r.value, "order": r.order, "correction": r.correction}})
    }

    fn stale(fresh: &Value, stored: &Value) -> Vec<String> {
        let mut out = vec![];
        compare(fresh, stored, "s", None, &mut out);
        out
    }

    #[test]
    fn richardson_outputs_move_with_their_inputs_only() {
        let stored = study_of([57.33200338881681, 57.03146301259986, 56.95607084918148]);
        let fresh = study_of([57.33200338881681 + 3e-8, 57.03146301259986 - 5e-8, 56.95607084918148 + 7e-8]);
        assert!(stale(&fresh, &stored).is_empty(), "{:?}", stale(&fresh, &stored));
        let mut edited = stored.clone();
        edited["omega"]["order"] = json!(stored["omega"]["order"].as_f64().unwrap() + 1e-9);
        assert_eq!(stale(&edited, &stored).len(), 1);
    }

    #[test]
    fn reductions_refuse_missing_and_non_finite_runs() {
        assert_eq!(largest(&[1.0, 3.0, 2.0], "x"), Ok(3.0));
        assert_eq!(least(&[1.0, 3.0, 2.0], "x"), Ok(1.0));
        assert!(largest(&[0.01, f64::NAN, 0.001], "x").is_err());
        assert!(least(&[f64::INFINITY], "x").is_err());
        assert!(least(&[], "slow").unwrap_err().contains("no runs"));
    }

    #[test]
    fn critical_heights_are_read_where_the_eigenvalue_changes_sign() {
        use snap_symmetry_vella_2024::spectrum::Spectrum;
        let point = |height: f64, omega2_antisymmetric: f64| BranchPoint { mu: 0.3, height, spectrum: Spectrum { omega2_antisymmetric, ..Spectrum::default() } };
        let branch = [point(-0.2, 5.0), point(-0.15, 1.0), point(-0.13, -3.0), point(-0.1, -4.0)];
        let h = zero_crossing(&branch, |p| p.spectrum.omega2_antisymmetric).unwrap();
        assert!((h - (-0.145)).abs() < 1e-15, "{h}");
        assert!(zero_crossing(&branch[..2], |p| p.spectrum.omega2_antisymmetric).is_err());
    }

    #[test]
    fn truncated_run_counts_match_exactly() {
        let count = |n: usize| json!({"dynamics": {"runs": 707, "truncated_runs": n}});
        assert_eq!(stale(&count(8), &count(9)).len(), 1);
        assert_eq!(stale(&count(11), &count(9)).len(), 1);
        assert!(stale(&count(9), &count(9)).is_empty());
        assert_eq!(stale(&count(12), &count(9)).len(), 1);
        assert_eq!(stale(&json!({"dynamics": {"runs": 706, "truncated_runs": 9}}), &count(9)).len(), 1);
    }

    #[test]
    fn eigenvalues_are_compared_against_their_spectrum() {
        let spectrum = |s: f64| json!({"omega2_symmetric": s, "omega2_antisymmetric": -195.13210150663298, "stiffness_symmetric": 1e-4, "stiffness_antisymmetric": -0.081});
        assert!(stale(&spectrum(0.07153081671261309), &spectrum(0.07152997994083818)).is_empty());
        assert_eq!(stale(&spectrum(0.0725), &spectrum(0.07152997994083818)).len(), 1);
    }
    #[test]
    fn review_counts_and_stability_signs_must_agree() {
        assert!(!stale(&json!({"truncated_runs": 10}), &json!({"truncated_runs": 9})).is_empty());
        let pair = |x| json!({"omega2_symmetric": x, "omega2_antisymmetric": -195.0});
        assert!(!stale(&pair(-0.00008), &pair(0.00008)).is_empty());
    }
    #[test]
    fn review_incomplete_evidence_cannot_pass_reductions() {
        use snap_symmetry_vella_2024::dynamics::Trace;
        let valid = Figure2a { truncated: false, rate_m_s: 0.0018, rate: 1.0,
            time_s: vec![-1.0, 0.0], travel_mm: vec![-1.8, 0.0],
            trace: Trace { t: vec![-1.0, 0.0], mu: vec![0.0018 / (PAPER_ALPHA.powi(2) * SIMULATIONS.length), 0.0], ..Trace::default() }, amplification: 1.0 };
        assert!(figure_2a_rate(std::slice::from_ref(&valid)).unwrap() < 1e-14);
        let mut stationary = valid.clone();
        stationary.trace.mu.fill(0.0);
        assert_eq!(figure_2a_rate(&[stationary]).unwrap(), 1.0);
        let mut undefined = valid.clone();
        undefined.time_s.fill(0.0);
        undefined.travel_mm.fill(0.0);
        assert!(figure_2a_rate(&[valid, undefined]).is_err());
        for expected in [&[0.0018, 0.2466][..], &[0.02, 0.01, 0.005, 0.0025]] {
            assert!(exact_values(expected.iter().copied().rev(), expected));
            let mut repeated = expected.to_vec();
            repeated[0] = repeated[1];
            assert!(!exact_values(repeated.into_iter(), expected));
        }
    }
}
